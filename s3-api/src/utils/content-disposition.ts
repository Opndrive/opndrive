/**
 * Builds an RFC 6266 `Content-Disposition` value that forces a download under a
 * chosen filename.
 *
 * Browsers ignore the `download` attribute on an anchor whose href points at
 * another origin, and a presigned S3 URL is always cross-origin. Without this
 * header S3 serves the object with no filename hint and the browser falls back
 * to the key's basename, so downloads land as hashed or otherwise wrong names.
 *
 * Two filename forms are emitted, per RFC 6266 §4.3:
 *   - `filename=` carries an ASCII-only fallback for legacy agents.
 *   - `filename*=` carries the exact UTF-8 name for agents that support RFC 5987.
 * Agents that understand `filename*` must prefer it, so non-ASCII names survive.
 */

/** Characters that would terminate or escape the quoted-string, plus C0/C1 controls. */
// eslint-disable-next-line no-control-regex
const UNSAFE_QUOTED = /[\u0000-\u001f\u007f-\u009f"\\]/g;
const NON_ASCII = /[^\x20-\x7e]/g;
/** Nonspacing combining marks, left over after NFD decomposition. */
const COMBINING_MARKS = /\p{Mn}/gu;

/**
 * Strips path separators so a key like `a/b/evil.txt` cannot smuggle a
 * directory component into the suggested name.
 */
function basename(name: string): string {
  const parts = name.split(/[\\/]/);
  return parts[parts.length - 1] ?? '';
}

/**
 * Percent-encodes per RFC 5987 `attr-char`. `encodeURIComponent` already covers
 * UTF-8 multibyte sequences; the extra replacements cover ASCII punctuation it
 * leaves untouched but which is not valid in an `attr-char` production.
 */
function encodeRfc5987(value: string): string {
  return encodeURIComponent(value).replace(
    /['()*!]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()
  );
}

/**
 * @param filename - Desired name for the saved file. Any directory component is
 *   dropped and header-breaking characters are removed.
 * @returns A `Content-Disposition` value, or `undefined` when `filename`
 *   contains nothing usable (callers should then omit the header entirely
 *   rather than send an empty filename).
 */
export function buildAttachmentDisposition(filename: string): string | undefined {
  const name = basename(filename).trim();
  if (!name) return undefined;

  // Quoted-string form: drop anything non-ASCII and anything that would break
  // out of the quotes. This is only the fallback; `filename*` carries the truth.
  // Stripping non-ASCII also removes CR/LF, so the value cannot inject a header.
  //
  // Decomposing first turns accented letters into base letter + combining mark,
  // so "café" degrades to "cafe" rather than "caf".
  const ascii = name
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(NON_ASCII, '')
    .replace(UNSAFE_QUOTED, '')
    .trim();

  // A name that is entirely non-ASCII ("文档.pdf") leaves behind only its
  // extension, or nothing at all. Keep the extension so the OS still opens the
  // file correctly, but give it a real stem instead of emitting ".pdf" or "".
  const extension = /\.[^.\s]+$/.exec(ascii)?.[0] ?? '';
  const stem = ascii.slice(0, ascii.length - extension.length).trim();
  const fallback = stem ? ascii : `download${extension}`;

  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeRfc5987(name)}`;
}

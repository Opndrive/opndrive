import { getMimeType } from '@/config/file-extensions';

/**
 * The Content-Type to store a file under.
 *
 * The browser's own answer first. It comes from the operating system's file
 * associations, which know about far more types than any list kept here.
 *
 * But the browser often has no answer at all - an iPhone photo on Windows, a
 * Matroska video, anything the OS was never told about - and then reports an
 * empty string. Sent like that, S3 stores the file as binary/octet-stream, and
 * anything reading it later without the app's previews in front, such as a
 * shared link, sees a download instead of a photo. The extension map fills
 * that gap, and only that gap.
 */
export function contentTypeFor(file: File): string {
  return file.type || getMimeType(file.name);
}

/**
 * A blog post's cover, drawn from its title: the 1200x630 card used as its
 * share image and, on the site, as its picture when the author set none.
 *
 * It follows the covers drawn by hand for the first posts - the Opndrive mark,
 * the category, the title in bold, the blog's address - so a post published
 * without one looks like it belongs.
 *
 * The fonts and the logo are read from /public at run time, which is where the
 * Docker image keeps them (it carries .next, public and node_modules, not src)
 * and what next.config traces for the serverless build. Should either fail to
 * load, the cover is still drawn, in next/og's own font and without the mark.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

export const COVER_WIDTH = 1200;
export const COVER_HEIGHT = 630;

interface CoverAssets {
  fonts: Array<{ name: string; data: ArrayBuffer; weight: 400 | 600 | 700; style: 'normal' }>;
  logo: string | null;
}

let assets: Promise<CoverAssets> | undefined;

function publicFile(...parts: string[]): string {
  return join(process.cwd(), 'public', ...parts);
}

function loadAssets(): Promise<CoverAssets> {
  assets ??= (async () => {
    const font = async (weight: 400 | 600 | 700) => {
      const data = await readFile(publicFile('fonts', `inter-latin-${weight}-normal.woff`));
      return {
        name: 'Inter',
        data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer,
        weight,
        style: 'normal' as const,
      };
    };

    const [fonts, logo] = await Promise.all([
      Promise.all([font(400), font(600), font(700)]).catch((error: unknown) => {
        console.error('Blog cover: fonts unavailable, using the default', error);
        return [];
      }),
      readFile(publicFile('logo.png'))
        .then((data) => `data:image/png;base64,${data.toString('base64')}`)
        .catch((error: unknown) => {
          console.error('Blog cover: logo unavailable', error);
          return null;
        }),
    ]);
    // A missing file is not remembered: the next cover tries again.
    if (!fonts.length || !logo) assets = undefined;
    return { fonts, logo };
  })();
  return assets;
}

/** The title's size, stepped down as it grows, so a long one still fits. */
export function titleFontSize(title: string): number {
  const length = title.length;
  if (length <= 48) return 72;
  if (length <= 80) return 60;
  if (length <= 120) return 52;
  return 44;
}

/** Long titles end at a word with an ellipsis rather than leaving the card. */
export function fitTitle(title: string, max = 150): string {
  const chars = Array.from(title.trim());
  if (chars.length <= max) return chars.join('');
  const cut = chars.slice(0, max).join('');
  const atWord = cut.slice(0, cut.lastIndexOf(' ')).trimEnd();
  return `${atWord || cut}…`;
}

export interface CoverContent {
  title: string;
  /** Shown above the title; left out when there is none worth showing. */
  category?: string;
}

export async function renderBlogCover(
  { title, category }: CoverContent,
  init?: ResponseInit
): Promise<ImageResponse> {
  const { fonts, logo } = await loadAssets();
  const text = fitTitle(title);
  const label = category && category.toLowerCase() !== 'uncategorized' ? category : null;

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '64px 72px',
        fontFamily: 'Inter',
        color: '#ffffff',
        backgroundColor: '#0b1b3d',
        backgroundImage:
          'radial-gradient(circle at 85% 12%, rgba(122, 166, 255, 0.35), rgba(122, 166, 255, 0) 38%), linear-gradient(135deg, #0a1734 0%, #10295f 52%, #1c5bd8 100%)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {logo ? <img src={logo} width={48} height={48} alt="" /> : null}
        <div style={{ fontSize: 32, fontWeight: 600, letterSpacing: '-0.01em' }}>Opndrive</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {label ? (
          <div
            style={{
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: '#a9c6ff',
            }}
          >
            {label}
          </div>
        ) : null}
        <div
          style={{
            fontSize: titleFontSize(text),
            fontWeight: 700,
            lineHeight: 1.12,
            letterSpacing: '-0.02em',
            maxWidth: 1020,
          }}
        >
          {text}
        </div>
      </div>

      <div style={{ fontSize: 22, fontWeight: 400, color: 'rgba(214, 226, 255, 0.85)' }}>
        opndrive.app/blog
      </div>
    </div>,
    {
      width: COVER_WIDTH,
      height: COVER_HEIGHT,
      ...(fonts.length ? { fonts } : {}),
      ...init,
    }
  );
}

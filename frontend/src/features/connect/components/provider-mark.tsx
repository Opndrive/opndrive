import type { IconType } from 'react-icons';
import { FaAws } from 'react-icons/fa6';
import { LuSlidersHorizontal } from 'react-icons/lu';
import { SiBackblaze, SiCloudflare, SiMinio, SiWasabi } from 'react-icons/si';
import type { S3Provider } from '@/config/providers';

/**
 * The provider's own logo on a tinted tile.
 *
 * Icons come from react-icons, which is already a dependency: Simple Icons for
 * four of them and Font Awesome's brand set for AWS, whose marks Simple Icons
 * dropped over Amazon's trademark policy. We show them to identify what
 * Opndrive connects to, which is nominative use, but the marks belong to their
 * owners and each vendor's brand guidelines still apply.
 *
 * Colours come from `--provider-*` tokens in globals.css rather than from the
 * registry, which holds no styling at all. The class strings are written out in
 * full because Tailwind reads source text: a computed name like
 * `text-provider-${slug}` produces no CSS.
 *
 * The custom-endpoint entry is the exception to all of the above: no vendor, so
 * no logo to show and no brand colour to honour. It gets sliders on a neutral
 * tile, which says "you fill this one in" rather than pretending to be a sixth
 * company. A gear would read as app settings, which is a different promise.
 */

interface ProviderVisual {
  Icon: IconType;
  /** Tile tint and glyph colour, as literal classes so Tailwind sees them. */
  palette: string;
}

const PROVIDER_VISUALS: Record<string, ProviderVisual> = {
  'aws-s3': { Icon: FaAws, palette: 'bg-provider-aws-soft text-provider-aws' },
  'cloudflare-r2': { Icon: SiCloudflare, palette: 'bg-provider-r2-soft text-provider-r2' },
  wasabi: { Icon: SiWasabi, palette: 'bg-provider-wasabi-soft text-provider-wasabi' },
  'backblaze-b2': { Icon: SiBackblaze, palette: 'bg-provider-b2-soft text-provider-b2' },
  minio: { Icon: SiMinio, palette: 'bg-provider-minio-soft text-provider-minio' },
  'custom-endpoint': {
    Icon: LuSlidersHorizontal,
    palette: 'bg-provider-custom-soft text-provider-custom',
  },
};

const SIZES = {
  sm: { box: 'h-9 w-9 rounded-lg', glyph: 18 },
  md: { box: 'h-11 w-11 rounded-xl', glyph: 22 },
  lg: { box: 'h-14 w-14 rounded-2xl', glyph: 28 },
} as const;

interface ProviderMarkProps {
  provider: S3Provider;
  size?: keyof typeof SIZES;
  /** Overrides the glyph size that `size` would otherwise imply, box unchanged. */
  iconSize?: number;
  className?: string;
}

export function ProviderMark({
  provider,
  size = 'md',
  iconSize,
  className = '',
}: ProviderMarkProps) {
  const dimensions = SIZES[size];
  const visual = PROVIDER_VISUALS[provider.slug];

  if (!visual) return null;

  const { Icon, palette } = visual;

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ${dimensions.box} ${palette} ${className}`}
    >
      {/* The provider name is always rendered next to this, so the logo is
          decorative and should not be read out a second time. */}
      <Icon size={iconSize ?? dimensions.glyph} aria-hidden="true" focusable="false" />
    </span>
  );
}

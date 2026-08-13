import { ArrowRight, MessageCircle } from 'lucide-react';
import { DISCORD_URL } from '@/lib/links';
import styles from './community-card.module.css';

const AVATARS = [
  '/discord-bento/builder-1.svg',
  '/discord-bento/builder-2.svg',
  '/discord-bento/builder-3.svg',
  '/discord-bento/builder-4.svg',
];

/**
 * Community tile for the docs home, mirroring the app's landing card.
 *
 * Docs is a separate app without Tailwind, so this reproduces the tile in a
 * CSS module instead of sharing the component - see community-card.module.css.
 * Art is duplicated into docs/public/discord-bento/ for the same reason.
 */
export function CommunityCard() {
  return (
    <div className={styles.tile}>
      <span className={styles.glowPrimary} aria-hidden="true" />
      <span className={styles.glowBrand} aria-hidden="true" />
      <span
        className={styles.cornerArt}
        aria-hidden="true"
        style={{ backgroundImage: "url('/discord-bento/builders.svg')" }}
      />

      <div className={styles.body}>
        <div>
          <span className={styles.badge}>
            <span className={styles.pulse} />
            Every other day @ 5 PM UTC
          </span>

          <h3 className={styles.heading}>Build Opndrive with us</h3>
          <p className={styles.copy}>
            Live demos, reviews on your PRs, and a hand when you get stuck.
          </p>

          <div className={styles.members}>
            <span className={styles.avatars}>
              {AVATARS.map((src) => (
                <span
                  key={src}
                  className={styles.avatar}
                  aria-hidden="true"
                  style={{ backgroundImage: `url('${src}')` }}
                />
              ))}
            </span>
            <span className={styles.membersLabel}>Be an early member</span>
          </div>
        </div>

        <a className={styles.cta} href={DISCORD_URL} target="_blank" rel="noopener noreferrer">
          <MessageCircle size={18} />
          Join our Discord
          <ArrowRight size={16} className={styles.ctaArrow} />
        </a>
      </div>
    </div>
  );
}

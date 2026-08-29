'use client';

import { useRouter } from 'next/navigation';
import ThemeToggleCustom from '@/shared/components/layout/ThemeToggleCustom';
import { FaGithub } from 'react-icons/fa';
import { useOpndriveStars } from '@/hooks/use-github-stars';
import { DiscordCommunityLink } from '@/shared/components/discord/discord-community-link';
import { DOCS_URL } from '@/config/links';
import { DashboardLink } from '@/shared/components/layout/dashboard-link';

const navItems = [
  { label: 'Home', href: '#hero' },
  { label: 'Features', href: '#features' },
  { label: 'Tools', href: '#tools' },
  { label: 'FAQ', href: '#faq' },
  { label: 'Docs', href: DOCS_URL },
  { label: 'Get Started', href: '#get-started' },
];

interface NavbarProps {
  /**
   * Owned by the page, which watches the hero once on behalf of this navbar
   * and the mobile one, so a single observer drives the whole handover and the
   * two bars can never disagree about where the hero ended.
   */
  scrolledPastHero: boolean;
}

export default function Navbar({ scrolledPastHero }: NavbarProps) {
  const router = useRouter();

  // Use custom hook for GitHub stars
  const { stars } = useOpndriveStars();

  return (
    /* Always mounted, revealed by opacity alone.

       This used to mount the moment the hero went past, which built the nav -
       thirty-odd nodes, a backdrop-filter layer to rasterise, and a star count
       that lands a tick later and re-centres the pill - on the one frame the
       browser was already busy scrolling, and then ran two setTimeouts to fade
       what it had just built. That was the jerk. The nav is now built with the
       rest of the page, and showing it costs a composited fade, which is what
       the mobile bar in page.tsx has always done.

       `invisible` and not just `opacity-0`, because a nav that now stays in the
       DOM would otherwise keep its links tabbable and announced while nobody
       can see them. Visibility is a stepped transition - it flips to visible at
       the start of the fade in and holds until the end of the fade out - so the
       links come and go exactly with the pill. */
    <div
      className={`hidden lg:block fixed top-4 left-1/2 transform -translate-x-1/2 transition-all duration-300 z-50 ${
        scrolledPastHero
          ? 'visible opacity-100 translate-y-0'
          : 'invisible opacity-0 -translate-y-2'
      }`}
    >
      <nav className="bg-card/90 backdrop-blur-md border border-border rounded-full px-8 py-4 shadow-lg">
        <div className="flex items-center gap-6">
          {navItems.map((item, index) => (
            <button
              key={index}
              onClick={() => {
                if (item.href.startsWith('http')) {
                  window.location.href = item.href;
                  return;
                }
                if (!item.href.startsWith('#')) {
                  router.push(item.href);
                  return;
                }
                const element = document.querySelector(item.href);
                if (element) {
                  element.scrollIntoView({ behavior: 'smooth' });
                }
              }}
              className="text-md font-medium text-muted-foreground hover:text-foreground transition-colors duration-200 whitespace-nowrap"
            >
              {item.label}
            </button>
          ))}

          <div className="flex items-center gap-3 ml-2">
            {/* GitHub Star Button */}
            <a
              href="https://github.com/opndrive/opndrive"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-2 py-1 transition-colors duration-200 group"
              style={{
                color: 'var(--muted-foreground)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--foreground)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--muted-foreground)';
              }}
            >
              <FaGithub className="w-5 h-5 group-hover:scale-110 transition-transform duration-200" />
              {stars !== null && (
                <span
                  className="text-sm font-medium tabular-nums"
                  style={{
                    color: 'inherit',
                  }}
                >
                  {stars.toLocaleString()}
                </span>
              )}
              {stars === null && (
                <div
                  className="w-6 h-4 rounded animate-pulse"
                  style={{ backgroundColor: 'var(--muted)' }}
                />
              )}
            </a>

            {/* Discord Community Link */}
            <DiscordCommunityLink
              placement="bottom"
              className="flex items-center gap-2 px-2 py-1"
              iconClassName="w-5 h-5"
            />

            <ThemeToggleCustom />

            {/* Only renders for a visitor who already has a bucket
                  connected. The nav is otherwise the same signed in or out. */}
            <DashboardLink />
          </div>
        </div>
      </nav>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FaGithub } from 'react-icons/fa';
import { Menu, X } from 'lucide-react';
import HeroSection from '@/features/landing-page/components/hero-section';
import Navbar from '@/features/landing-page/components/navbar';
import { DiscordCommunityLink } from '@/shared/components/discord/discord-community-link';
import FeaturesSection from '@/features/landing-page/components/feature-section';
import WorkSmarterSection from '@/features/landing-page/components/work-smarter-section';
import FAQSection from '@/features/landing-page/components/faq-section';
import CTASection from '@/features/landing-page/components/cta-section';
import ThemeToggleCustom from '@/shared/components/layout/ThemeToggleCustom';
import { SiteFooter } from '@/shared/components/layout/site-footer';
import { useOpndriveStars } from '@/hooks/use-github-stars';
import { useAuth } from '@/hooks/use-auth';
import { useScrolledPast } from '@/hooks/use-scrolled-past';
import { DOCS_URL } from '@/config/links';

const navItems = [
  { label: 'Home', href: '#hero' },
  { label: 'Features', href: '#features' },
  { label: 'Tools', href: '#tools' },
  { label: 'FAQ', href: '#faq' },
  { label: 'Docs', href: DOCS_URL },
  { label: 'Get Started', href: '#get-started' },
];

export default function LandingPage() {
  const router = useRouter();
  const { userCreds } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Use custom hook for GitHub stars
  const { stars } = useOpndriveStars();

  /**
   * One reading of where the hero ends, for both navbars.
   *
   * The hero's own sentinel is the thing watched, so the bar that lives inside
   * the hero and the bars that take over from it hand off at exactly the same
   * pixel - there is no window where a floating nav overlaps a hero that is
   * still on screen, which is what made the page look like it had two navbars
   * at once.
   */
  const scrolledPastHero = useScrolledPast('hero-anchor');

  /**
   * Where the main call to action goes, and what it admits to doing.
   *
   * It has always sent a visitor with a connected bucket to their drive rather
   * than back through the connect flow - it just did so while still reading
   * "Get Started", so the one button whose label people rely on was the one
   * that did not describe itself. The label now names the destination.
   *
   * The session comes from the auth context rather than a second, hand-copied
   * read of the `s3_user_session` key, which is the sort of duplicate that
   * survives a rename of the original.
   *
   * There is deliberately no loading state. This page is public now, so the
   * server renders it before any session has been looked for - and a hero
   * button reading "Loading..." is what a crawler would have indexed as the
   * call to action. It says "Get Started" and goes to /connect until a session
   * turns up, which is the right answer for almost everyone who lands here and
   * a harmless one for the rest: /connect offers them the way back in.
   */
  const hasSession = userCreds !== null;
  const ctaLabel = hasSession ? 'Go to Dashboard' : 'Get Started';

  const handleGetStarted = () => {
    router.push(hasSession ? '/dashboard' : '/connect');
  };

  /**
   * Jump to a section, or leave the page for the ones that are not on it.
   *
   * `scrollIntoView` puts the target's top edge at the top of the viewport,
   * which is the one place a fixed navbar is guaranteed to be - so every link
   * in this menu landed its own destination's heading underneath the bar the
   * reader had just tapped. "Curious about Opndrive?" arrived sliced in half.
   * The sections carry `scroll-mt` matching each navbar's height for that, so
   * the browser stops short by exactly the bar it is scrolling under; there is
   * nothing to do here beyond asking for the scroll.
   */
  const handleNavClick = (href: string) => {
    setIsMobileMenuOpen(false);
    if (href.startsWith('http')) {
      window.location.href = href;
      return;
    }
    if (!href.startsWith('#')) {
      router.push(href);
      return;
    }
    const element = document.querySelector(href);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <main>
      {/* Simple Mobile Navbar - Hidden in hero, visible after.

          The hairline along the bottom is a shadow rather than `border-b`, so
          the bar is exactly the `h-14 sm:h-16` it says it is. As a border it
          measured a pixel taller than that, and the strip below the hero that
          reserves room for it was sized off the stated height, so the bar sat
          a pixel over the section it was supposed to stop above. */}
      <div
        className={`lg:hidden fixed top-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-md shadow-[0_1px_0_0_var(--border)] transition-all duration-300 ${
          scrolledPastHero
            ? 'opacity-100 translate-y-0'
            : 'opacity-0 -translate-y-full pointer-events-none'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14 sm:h-16">
            {/* Logo */}
            <div className="flex items-center gap-2">
              <img src="/logo.png" alt="Opndrive Logo" className="w-6 h-6 sm:w-7 sm:h-7" />
              <span className="text-base sm:text-lg font-bold text-foreground">Opndrive</span>
            </div>

            {/* Hamburger Menu Button */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Menu"
            >
              {isMobileMenuOpen ? (
                <X className="w-5 h-5 sm:w-6 sm:h-6" />
              ) : (
                <Menu className="w-5 h-5 sm:w-6 sm:h-6" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Menu Dropdown.

            Capped at what is left of the viewport below the bar, and scrollable
            past that. Six links, three action rows and a button come to roughly
            620px, which clears a tall phone and does not clear a short one once
            the browser's own chrome has taken its cut - and with nothing to
            scroll, the "Get Started" button at the bottom simply could not be
            reached. `dvh` rather than `vh` because the cut the address bar takes
            is exactly what this needs to measure. */}
        {isMobileMenuOpen && scrolledPastHero && (
          <div className="border-t border-border bg-card/98 backdrop-blur-md max-h-[calc(100dvh-3.5rem)] sm:max-h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
              {/* Navigation Links */}
              <div className="space-y-3 mb-4">
                {navItems.map((item, index) => (
                  <button
                    key={index}
                    onClick={() => handleNavClick(item.href)}
                    className="block w-full text-left px-3 py-2 text-md font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {/* Divider */}
              <div className="border-t border-border my-4" />

              {/* Actions Section */}
              <div className="space-y-3">
                {/* GitHub Link */}
                <a
                  href="https://github.com/opndrive/opndrive"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
                >
                  <FaGithub className="w-4 h-4" />
                  <span>GitHub</span>
                  {stars !== null && (
                    <span className="ml-auto text-xs tabular-nums">{stars.toLocaleString()}</span>
                  )}
                </a>

                {/* Discord Community - taps open the Bento sheet */}
                <DiscordCommunityLink
                  variant="row"
                  onOpenSheet={() => setIsMobileMenuOpen(false)}
                />

                {/* Theme Toggle */}
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-sm font-medium text-muted-foreground">Theme</span>
                  <ThemeToggleCustom />
                </div>

                {/* Get Started Button */}
                <button
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    handleGetStarted();
                  }}
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2.5 text-sm font-medium rounded-md transition-colors"
                >
                  {ctaLabel}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Overlay to close menu when clicking outside */}
      {isMobileMenuOpen && scrolledPastHero && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      <HeroSection handleGetStarted={handleGetStarted} ctaLabel={ctaLabel} />

      {/* Room for the fixed mobile bar, reserved always rather than at the
          moment it appears. Toggling it pushed everything below the hero down
          by 56px on the exact scroll position where the bar faded in - and an
          inline style beats `lg:pt-0`, so desktop got the shove too.

          Held open permanently it is not, as first written here, hidden until
          the bar covers it. The bar only arrives once the hero is entirely
          past, but this strip enters the viewport from the bottom edge a whole
          screen before that, and it was padding on a transparent wrapper, so
          what showed through was `body` - `--secondary`, a lighter band than
          the `--background` on either side of it. It read as a seam in the
          wrong colour sliding up the page ahead of the navbar.

          So it is a strip of its own now, painted `--background` like its
          neighbours and carrying the divider artwork, which makes the same
          56px read as the deliberate join between hero and page that the
          reader is about to scroll through. Exactly the height of the bar that
          lands on it, and gone at `lg` where there is no bar to make room for. */}
      <div
        aria-hidden="true"
        className="relative isolate h-14 overflow-hidden bg-background sm:h-16 lg:hidden"
      >
        <div className="hero-divider-art absolute inset-0" />
      </div>

      <Navbar scrolledPastHero={scrolledPastHero} />
      <FeaturesSection />
      <WorkSmarterSection />
      <FAQSection />
      <CTASection handleGetStarted={handleGetStarted} ctaLabel={ctaLabel} />
      <SiteFooter />
    </main>
  );
}

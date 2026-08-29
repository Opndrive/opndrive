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
      {/* Simple Mobile Navbar - Hidden in hero, visible after */}
      <div
        className={`lg:hidden fixed top-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-md border-b border-border transition-all duration-300 ${
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

        {/* Mobile Menu Dropdown */}
        {isMobileMenuOpen && scrolledPastHero && (
          <div className="border-t border-border bg-card/98 backdrop-blur-md">
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
          moment it appears. Toggling this padding pushed everything below the
          hero down by 56px on the exact scroll position where the bar faded in
          - and an inline style beats `lg:pt-0`, so desktop got the shove too.
          Held open permanently it costs nothing to look at: the hero is
          min-h-screen, so this padding is below the fold until the very scroll
          position where the bar arrives to cover it. */}
      <div className="pt-14 sm:pt-16 lg:pt-0">
        <Navbar scrolledPastHero={scrolledPastHero} />
        <FeaturesSection />
        <WorkSmarterSection />
        <FAQSection />
        <CTASection handleGetStarted={handleGetStarted} ctaLabel={ctaLabel} />
        <SiteFooter />
      </div>
    </main>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { FaGithub } from 'react-icons/fa';
import { Menu, X } from 'lucide-react';
import HeroSection from '@/features/landing-page/components/hero-section';
import Navbar from '@/features/landing-page/components/navbar';
import FeaturesSection from '@/features/landing-page/components/feature-section';
import WorkSmarterSection from '@/features/landing-page/components/work-smarter-section';
import FAQSection from '@/features/landing-page/components/faq-section';
import CTASection from '@/features/landing-page/components/cta-section';
import ThemeToggleCustom from '@/shared/components/layout/ThemeToggleCustom';

const navItems = [
  { label: 'Home', href: '#hero' },
  { label: 'Features', href: '#features' },
  { label: 'Tools', href: '#tools' },
  { label: 'FAQ', href: '#faq' },
  { label: 'Get Started', href: '#get-started' },
];

export default function LandingPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showMobileNav, setShowMobileNav] = useState(false);
  const [stars, setStars] = useState<number | null>(null);

  // Fetch GitHub stars
  useEffect(() => {
    const fetchGitHubStars = async () => {
      try {
        const response = await fetch('https://api.github.com/repos/opndrive/opndrive');
        if (response.ok) {
          const data = await response.json();
          setStars(data.stargazers_count);
        }
      } catch (error) {
        console.error('Failed to fetch GitHub stars:', error);
      }
    };

    fetchGitHubStars();
  }, []);

  // Simple scroll detection to show navbar after hero section
  useEffect(() => {
    const handleScroll = () => {
      const heroSection = document.getElementById('hero');
      if (heroSection) {
        const heroRect = heroSection.getBoundingClientRect();
        const shouldShowNav = heroRect.bottom <= 0; // Show when hero is completely scrolled past
        setShowMobileNav(shouldShowNav);
      }
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll(); // Check initial state

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleGetStarted = async () => {
    setIsLoading(true);

    try {
      await new Promise((resolve) => setTimeout(resolve, 300));

      const stored = localStorage.getItem('s3_user_session');
      if (stored) {
        router.push('/dashboard');
      } else {
        router.push('/connect');
      }
    } catch (error) {
      console.error('Error during navigation:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNavClick = (href: string) => {
    setIsMobileMenuOpen(false);
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
          showMobileNav
            ? 'opacity-100 translate-y-0'
            : 'opacity-0 -translate-y-full pointer-events-none'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14 sm:h-16">
            {/* Logo */}
            <div className="flex items-center gap-2">
              <img src="/logo-nobg.png" alt="Opndrive Logo" className="w-6 h-6 sm:w-7 sm:h-7" />
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
        {isMobileMenuOpen && showMobileNav && (
          <div className="border-t border-border bg-card/98 backdrop-blur-md">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
              {/* Navigation Links */}
              <div className="space-y-3 mb-4">
                {navItems.map((item, index) => (
                  <button
                    key={index}
                    onClick={() => handleNavClick(item.href)}
                    className="block w-full text-left px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
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
                  disabled={isLoading}
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2.5 text-sm font-medium rounded-md transition-colors"
                >
                  {isLoading ? 'Loading...' : 'Get Started'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Overlay to close menu when clicking outside */}
      {isMobileMenuOpen && showMobileNav && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      <HeroSection handleGetStarted={handleGetStarted} isLoading={isLoading} />
      {/* Add top padding after hero section for mobile navbar */}
      <div className="lg:pt-0" style={{ paddingTop: showMobileNav ? '3.5rem' : '0' }}>
        <Navbar />
        <FeaturesSection />
        <WorkSmarterSection />
        <FAQSection />
        <CTASection handleGetStarted={handleGetStarted} isLoading={isLoading} />
      </div>
    </main>
  );
}

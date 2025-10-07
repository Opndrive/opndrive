'use client';

import { useState, useEffect } from 'react';
import ThemeToggleCustom from '@/shared/components/layout/ThemeToggleCustom';
import { FaGithub } from 'react-icons/fa';
import { useOpndriveStars } from '@/hooks/use-github-stars';

const navItems = [
  { label: 'Home', href: '#hero' },
  { label: 'Features', href: '#features' },
  { label: 'Tools', href: '#tools' },
  { label: 'FAQ', href: '#faq' },
  { label: 'Get Started', href: '#get-started' },
];

export default function Navbar() {
  const [isSticky, setIsSticky] = useState(false);
  const [showSticky, setShowSticky] = useState(false);

  // Use custom hook for GitHub stars
  const { stars } = useOpndriveStars();

  useEffect(() => {
    const handleScroll = () => {
      const staticNavbar = document.getElementById('static-navbar');
      if (staticNavbar) {
        const staticNavbarRect = staticNavbar.getBoundingClientRect();
        const shouldBeSticky = staticNavbarRect.bottom <= 0;

        if (shouldBeSticky && !isSticky) {
          // Small delay to prevent jerky transition
          setIsSticky(true);
          setTimeout(() => setShowSticky(true), 50);
        } else if (!shouldBeSticky && isSticky) {
          setShowSticky(false);
          setTimeout(() => setIsSticky(false), 200);
        }
      }
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll(); // Check initial state

    return () => window.removeEventListener('scroll', handleScroll);
  }, [isSticky]);

  // Don't render anything if not sticky
  if (!isSticky) return null;

  return (
    <>
      {/* Sticky navbar with smooth fade-in transition */}
      <div
        className={`hidden lg:block fixed top-4 left-1/2 transform -translate-x-1/2 transition-all duration-300 z-50 ${
          showSticky ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
        }`}
      >
        <nav className="bg-card/90 backdrop-blur-md border border-border rounded-full px-8 py-4 shadow-lg">
          <div className="flex items-center gap-6">
            {navItems.map((item, index) => (
              <button
                key={index}
                onClick={() => {
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

              <ThemeToggleCustom />
            </div>
          </div>
        </nav>
      </div>
    </>
  );
}

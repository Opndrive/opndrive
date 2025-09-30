'use client';

import { useState, useEffect } from 'react';
import ThemeToggleCustom from '@/shared/components/layout/ThemeToggleCustom';

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
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors duration-200 whitespace-nowrap"
              >
                {item.label}
              </button>
            ))}

            <div className="ml-2">
              <ThemeToggleCustom />
            </div>
          </div>
        </nav>
      </div>
    </>
  );
}

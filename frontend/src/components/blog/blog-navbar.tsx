'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import ThemeToggleCustom from '@/shared/components/layout/ThemeToggleCustom';
import { FaGithub } from 'react-icons/fa';
import { useOpndriveStars } from '@/hooks/use-github-stars';

const navItems = [
  { label: 'Home', href: '/' },
  { label: 'Features', href: '/#features' },
  { label: 'Tools', href: '/#tools' },
  { label: 'Get Started', href: '/#get-started' },
];

export default function BlogNavbar() {
  const [isSticky, setIsSticky] = useState(false);
  const [_showSticky, setShowSticky] = useState(false);

  // Use custom hook for GitHub stars
  const { stars } = useOpndriveStars();

  useEffect(() => {
    const handleScroll = () => {
      const staticNavbar = document.getElementById('static-navbar');
      if (staticNavbar) {
        const staticNavbarRect = staticNavbar.getBoundingClientRect();
        const shouldBeSticky = staticNavbarRect.bottom <= 0;

        if (shouldBeSticky && !isSticky) {
          setIsSticky(true);
          setTimeout(() => setShowSticky(true), 50);
        } else if (!shouldBeSticky && isSticky) {
          setShowSticky(false);
          setTimeout(() => setIsSticky(false), 200);
        }
      }
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll();

    return () => window.removeEventListener('scroll', handleScroll);
  }, [isSticky]);

  return (
    <>
      {/* Static Navbar at Top */}
      <div className="w-full py-4 bg-background">
        <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex items-center justify-between">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2">
              <Image
                src="/logo.png"
                alt="Opndrive"
                width={40}
                height={40}
                className="object-contain"
              />
              <span className="text-xl font-bold text-foreground">Opndrive</span>
            </Link>

            {/* Desktop Navigation - Centered */}
            <div className="hidden lg:flex items-center gap-8 absolute left-1/2 transform -translate-x-1/2">
              {navItems.map((item, index) => (
                <Link
                  key={index}
                  href={item.href}
                  className="text-md font-medium text-muted-foreground hover:text-foreground transition-colors duration-200"
                >
                  {item.label}
                </Link>
              ))}
            </div>

            {/* Right Side Actions */}
            <div className="hidden lg:flex items-center gap-3">
              {/* GitHub Star Button */}
              <a
                href="https://github.com/opndrive/opndrive"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-2 py-1 text-muted-foreground hover:text-foreground transition-colors duration-200 group"
              >
                <FaGithub className="w-5 h-5 group-hover:scale-110 transition-transform duration-200" />
                {stars !== null && (
                  <span className="text-sm font-medium tabular-nums">{stars.toLocaleString()}</span>
                )}
                {stars === null && <div className="w-6 h-4 rounded animate-pulse bg-muted" />}
              </a>

              <ThemeToggleCustom />
            </div>

            {/* Mobile Menu Toggle */}
            <div className="flex lg:hidden items-center gap-3">
              <a
                href="https://github.com/opndrive/opndrive"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-muted-foreground"
              >
                <FaGithub className="w-5 h-5" />
              </a>
              <ThemeToggleCustom />
            </div>
          </nav>
        </div>
      </div>
    </>
  );
}

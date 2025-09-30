'use client';

import { useState, useEffect } from 'react';
import { useTheme } from '@/providers/theme-provider';
import { Sun, Moon } from 'lucide-react';

export default function ThemeToggleCustom() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  // If the app is in 'system' mode, resolve current system preference
  const systemPrefersDark =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;

  const effective = theme === 'system' ? (systemPrefersDark ? 'dark' : 'light') : theme;

  const isDark = effective === 'dark';

  return (
    <div className="inline-flex items-center rounded-full bg-card/80 border border-border">
      <button
        type="button"
        onClick={() => setTheme('light')}
        aria-label="Light theme"
        className={`flex items-center justify-center w-10 h-8 rounded-l-full transition-colors duration-200 ${
          !isDark
            ? 'bg-secondary/90 text-foreground'
            : 'text-muted-foreground hover:text-foreground hover:bg-secondary/90'
        }`}
      >
        <Sun size={16} />
      </button>

      <button
        type="button"
        onClick={() => setTheme('dark')}
        aria-label="Dark theme"
        className={`flex items-center justify-center w-10 h-8 rounded-r-full transition-colors duration-200 ${
          isDark
            ? 'bg-secondary/90 text-foreground'
            : 'text-muted-foreground hover:text-foreground hover:bg-secondary/90'
        }`}
      >
        <Moon size={16} />
      </button>
    </div>
  );
}

'use client';

import { useTheme } from '@/providers/theme-provider';
import { useState, useEffect } from 'react';
import { Moon, Sun, Monitor } from 'lucide-react';
import { AriaLabel } from '../custom-aria-label';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div className="flex items-center justify-center p-1 rounded-full bg-accent backdrop-blur-sm space-x-6">
      <AriaLabel label="Switch to light theme" position="top">
        <button
          onClick={() => setTheme('light')}
          className={`p-2 rounded-full cursor-pointer transition-all ${
            theme === 'light'
              ? 'ring-1 ring-primary bg-secondary/90 text-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Sun size={18} />
        </button>
      </AriaLabel>

      <AriaLabel label="Use system theme preference" position="top">
        <button
          onClick={() => setTheme('system')}
          className={`p-2 rounded-full cursor-pointer transition-all ${
            theme === 'system'
              ? 'ring-1 ring-primary bg-secondary/90 text-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Monitor size={18} />
        </button>
      </AriaLabel>

      <AriaLabel label="Switch to dark theme" position="top">
        <button
          onClick={() => setTheme('dark')}
          className={`p-2 rounded-full cursor-pointer transition-all ${
            theme === 'dark'
              ? 'ring-1 ring-primary  bg-secondary/90 text-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Moon size={18} />
        </button>
      </AriaLabel>
    </div>
  );
}

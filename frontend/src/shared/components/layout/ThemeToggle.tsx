'use client';

import { useTheme } from '@/providers/theme-provider';
import { useState, useEffect } from 'react';
import { Moon, Sun, Monitor } from 'lucide-react';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div className="flex items-center justify-center p-1 rounded-full bg-accent backdrop-blur-sm space-x-6">
      <button
        onClick={() => setTheme('light')}
        className={`p-2 rounded-full transition-all ${
          theme === 'light'
            ? 'ring-1 ring-primary bg-secondary/90 text-primary'
            : 'text-muted-foreground hover:text-foreground'
        }`}
        aria-label="Light theme"
      >
        <Sun size={18} />
      </button>

      <button
        onClick={() => setTheme('system')}
        className={`p-2 rounded-full transition-all ${
          theme === 'system'
            ? 'ring-1 ring-primary bg-secondary/90 text-primary'
            : 'text-muted-foreground hover:text-foreground'
        }`}
        aria-label="System theme"
      >
        <Monitor size={18} />
      </button>

      <button
        onClick={() => setTheme('dark')}
        className={`p-2 rounded-full transition-all ${
          theme === 'dark'
            ? 'ring-1 ring-primary bg-secondary/90 text-primary'
            : 'text-muted-foreground hover:text-foreground'
        }`}
        aria-label="Dark theme"
      >
        <Moon size={18} />
      </button>
    </div>
  );
}

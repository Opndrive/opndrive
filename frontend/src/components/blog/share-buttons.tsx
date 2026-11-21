'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Check, Link2, Share2 } from 'lucide-react';
import { FaHackerNews, FaLinkedin, FaReddit } from 'react-icons/fa';
import { FaXTwitter } from 'react-icons/fa6';
import { cn } from '@/shared/utils/utils';

interface ShareButtonsProps {
  /** The post's canonical address. */
  url: string;
  title: string;
  className?: string;
}

// Whether a device has a share sheet does not change while the page is open.
const subscribeToNothing = () => () => {};
const hasShareSheet = () => typeof navigator.share === 'function';

const BUTTON =
  'inline-flex h-10 items-center justify-center gap-2 rounded-full border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

/**
 * Ways to pass a post on: copy its link, the places developers share links,
 * and the device's own share sheet where there is one (phones, mostly).
 *
 * The share targets are plain links to each site's documented share address,
 * so nothing from those sites loads on this page.
 */
export function ShareButtons({ url, title, className }: ShareButtonsProps) {
  const [copied, setCopied] = useState(false);
  // Known only in the browser: the server renders without the button, and it
  // appears after hydration where the device has a share sheet.
  const canShare = useSyncExternalStore(subscribeToNothing, hasShareSheet, () => false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // The address bar holds the same link; there is nothing better to offer.
    }
  };

  const share = async () => {
    try {
      await navigator.share({ title, url });
    } catch {
      // Dismissing the share sheet rejects too; that is not an error.
    }
  };

  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);
  const targets = [
    {
      name: 'X',
      href: `https://x.com/intent/post?url=${encodedUrl}&text=${encodedTitle}`,
      Icon: FaXTwitter,
    },
    {
      name: 'LinkedIn',
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
      Icon: FaLinkedin,
    },
    {
      name: 'Hacker News',
      href: `https://news.ycombinator.com/submitlink?u=${encodedUrl}&t=${encodedTitle}`,
      Icon: FaHackerNews,
    },
    {
      name: 'Reddit',
      href: `https://www.reddit.com/submit?url=${encodedUrl}&title=${encodedTitle}`,
      Icon: FaReddit,
    },
  ];

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <button type="button" onClick={copy} className={BUTTON}>
        {copied ? (
          <Check className="h-4 w-4 text-success" aria-hidden="true" />
        ) : (
          <Link2 className="h-4 w-4" aria-hidden="true" />
        )}
        {/* The label changes, so the change is announced with it. */}
        <span aria-live="polite">{copied ? 'Link copied' : 'Copy link'}</span>
      </button>

      {targets.map(({ name, href, Icon }) => (
        <a
          key={name}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Share on ${name} (opens in a new tab)`}
          title={`Share on ${name}`}
          className={cn(BUTTON, 'w-10 px-0')}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </a>
      ))}

      {canShare ? (
        <button type="button" onClick={share} className={BUTTON}>
          <Share2 className="h-4 w-4" aria-hidden="true" />
          Share…
        </button>
      ) : null}
    </div>
  );
}

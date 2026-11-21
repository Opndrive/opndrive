import { Rss } from 'lucide-react';
import { FaDiscord } from 'react-icons/fa';
import { DISCORD_URL } from '@/config/links';
import { cn } from '@/shared/utils/utils';

const LINK =
  'inline-flex h-10 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

/**
 * Ways to keep up with the blog: its RSS feed, and the community on Discord.
 * (No newsletter: the feed already does that job, without collecting an
 * address.)
 */
export function BlogFollowLinks({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <a
        href="/blog/rss.xml"
        type="application/rss+xml"
        className={cn(LINK, 'border border-border bg-card text-foreground hover:bg-muted')}
      >
        <Rss className="h-4 w-4 text-[#f26522]" aria-hidden="true" />
        RSS feed
      </a>
      <a
        href={DISCORD_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          LINK,
          'bg-discord-brand text-discord-brand-foreground hover:bg-discord-brand-hover'
        )}
      >
        <FaDiscord className="h-4 w-4" aria-hidden="true" />
        Join our Discord <span className="sr-only">(opens in a new tab)</span>
      </a>
    </div>
  );
}

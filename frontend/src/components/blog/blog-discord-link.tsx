import { FaDiscord } from 'react-icons/fa';
import { DISCORD_URL } from '@/config/links';
import { cn } from '@/shared/utils/utils';

/**
 * The way to keep up with the blog and the people behind it: the community on
 * Discord.
 *
 * There is no visible RSS button. The feed is still at /blog/rss.xml and every
 * blog page names it in its <head>, which is where feed readers and
 * aggregators look for it; a button only repeated that for the few readers who
 * would know what to do with it.
 */
export function BlogDiscordLink({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <a
        href={DISCORD_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-discord-brand px-4 text-sm font-medium text-discord-brand-foreground transition-colors hover:bg-discord-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <FaDiscord className="h-4 w-4" aria-hidden="true" />
        Join our Discord <span className="sr-only">(opens in a new tab)</span>
      </a>
    </div>
  );
}

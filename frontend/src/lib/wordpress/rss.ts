/**
 * The blog's RSS 2.0 feed, built as a string so it can be tested without a
 * server.
 *
 * An empty blog gives a valid feed with no items rather than an error: feed
 * readers subscribe to the address, and an empty channel is the honest answer
 * until the first post exists.
 */

import type { BlogPost } from './types';

export interface RssChannel {
  title: string;
  /** The page the feed describes, here the blog index. */
  link: string;
  description: string;
  /** The feed's own address, for the atom:link self reference. */
  selfUrl: string;
  /** Base URL that post slugs are appended to, e.g. https://opndrive.app/blog */
  postBaseUrl: string;
}

type FeedPost = Pick<BlogPost, 'slug' | 'title' | 'excerpt' | 'publishedDate' | 'publishedDateUtc'>;

/** Characters XML 1.0 does not allow at all, which WordPress text can carry. */
// eslint-disable-next-line no-control-regex
const INVALID_XML_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

export function escapeXml(text: string): string {
  return text.replace(INVALID_XML_CHARS, '').replace(/[&<>"']/g, (ch) => ESCAPES[ch]!);
}

/** RFC 822 date, as RSS 2.0 requires, or undefined for an unreadable date. */
function rfc822(date: string | undefined): string | undefined {
  if (!date) return undefined;
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toUTCString();
}

export function buildRssFeed(channel: RssChannel, posts: readonly FeedPost[]): string {
  const items = posts.map((post) => {
    const url = `${channel.postBaseUrl}/${encodeURIComponent(post.slug)}`;
    const pubDate = rfc822(post.publishedDateUtc ?? post.publishedDate);

    return [
      '    <item>',
      `      <title>${escapeXml(post.title)}</title>`,
      `      <link>${escapeXml(url)}</link>`,
      `      <guid isPermaLink="true">${escapeXml(url)}</guid>`,
      ...(pubDate ? [`      <pubDate>${pubDate}</pubDate>`] : []),
      ...(post.excerpt ? [`      <description>${escapeXml(post.excerpt)}</description>`] : []),
      '    </item>',
    ].join('\n');
  });

  const newest = posts
    .map((post) => rfc822(post.publishedDateUtc ?? post.publishedDate))
    .find((date): date is string => Boolean(date));

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    `    <title>${escapeXml(channel.title)}</title>`,
    `    <link>${escapeXml(channel.link)}</link>`,
    `    <description>${escapeXml(channel.description)}</description>`,
    '    <language>en</language>',
    `    <atom:link href="${escapeXml(channel.selfUrl)}" rel="self" type="application/rss+xml" />`,
    ...(newest ? [`    <lastBuildDate>${newest}</lastBuildDate>`] : []),
    ...items,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n');
}

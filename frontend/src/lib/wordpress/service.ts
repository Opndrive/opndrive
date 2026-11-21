/**
 * WordPress Service
 * High-level functions for fetching and transforming blog data
 */

import { fetchGraphQL, fetchGraphQLWithTags } from './client';
import {
  GET_ALL_POSTS,
  GET_RECENT_POSTS,
  GET_POST_BY_SLUG,
  GET_ALL_POST_SLUGS,
  GET_POSTS_BY_CATEGORY,
  GET_POST_SUMMARIES,
  GET_RELATED_POST_SUMMARIES,
} from './queries-simple'; // Using simplified queries without SEO
import type {
  WordPressPostsResponse,
  WordPressPostBySlugResponse,
  WordPressPostSummariesResponse,
  WordPressPostSummary,
  BlogPost,
  BlogPostSummary,
  WordPressPost,
  CategoryNode,
  TagNode,
} from './types';
import { decodeHtmlEntities, htmlToText } from './entities';

/**
 * A WPGraphQL "...Gmt" field as an ISO string Date can read.
 *
 * WPGraphQL gives these in UTC without a zone designator, so without a "Z"
 * they would be read in whatever zone the server runs in. A value that already
 * carries a zone is left alone.
 */
export function gmtToIso(gmt: string | undefined | null): string | undefined {
  if (!gmt) return undefined;
  return /(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(gmt) ? gmt : `${gmt}Z`;
}

/**
 * The first `count` characters, counted as code points: a decoded excerpt can
 * hold emoji, and cutting by UTF-16 unit could leave half of one behind.
 */
function firstChars(text: string, count: number): string {
  return Array.from(text).slice(0, count).join('');
}

/** A rendered WordPress text field (title, term name, SEO text) as plain text. */
function plainText(rendered: string | undefined | null): string {
  return rendered ? decodeHtmlEntities(rendered) : '';
}

/**
 * Transform WordPress post to simplified BlogPost format.
 *
 * Text fields come back from WPGraphQL rendered, entities and all, and are
 * decoded here once, so everything downstream handles plain text. Dates come
 * back as the site's local time with no offset; the `...Gmt` twins are used
 * for the exact instant, and the local one is kept only for showing the date.
 * `content` is HTML and stays as it is.
 */
export function transformPostSummary(
  post: WordPressPostSummary & Partial<Pick<WordPressPost, 'tags'>>
): BlogPostSummary {
  // Plain text from here on: components show it as it is, without stripping
  // tags again, which would eat a "<b>" the author wrote as text.
  const cleanExcerpt = post.excerpt ? htmlToText(post.excerpt).trim() : '';
  const title = plainText(post.title);

  return {
    id: post.id,
    slug: post.slug,
    title,
    excerpt: cleanExcerpt,
    publishedDate: gmtToIso(post.dateGmt) ?? post.date,
    publishedDateLocal: post.date,
    modifiedDate: gmtToIso(post.modifiedGmt) ?? post.modified,
    modifiedDateLocal: post.modified,
    author: {
      name: post.author?.node?.name || 'Anonymous',
      avatar: post.author?.node?.avatar?.url,
      bio: post.author?.node?.description,
    },
    featuredImage: post.featuredImage?.node
      ? {
          url: post.featuredImage.node.sourceUrl,
          alt: post.featuredImage.node.altText || title,
          width: post.featuredImage.node.mediaDetails?.width || 1200,
          height: post.featuredImage.node.mediaDetails?.height || 630,
        }
      : undefined,
    categories:
      post.categories?.nodes?.map((cat: CategoryNode) => ({
        id: cat.id,
        name: plainText(cat.name),
        slug: cat.slug,
      })) || [],
    tags:
      post.tags?.nodes?.map((tag: TagNode) => ({
        id: tag.id,
        name: plainText(tag.name),
        slug: tag.slug,
      })) || [],
  };
}

export function transformPost(post: WordPressPost): BlogPost {
  const summary = transformPostSummary(post);
  const { title, excerpt: cleanExcerpt } = summary;

  return {
    ...summary,
    content: post.content,
    seo: {
      title: plainText(post.seo?.title) || title,
      description: plainText(post.seo?.metaDesc) || firstChars(cleanExcerpt, 160),
      ogTitle: plainText(post.seo?.opengraphTitle) || plainText(post.seo?.title) || title,
      ogDescription:
        plainText(post.seo?.opengraphDescription) ||
        plainText(post.seo?.metaDesc) ||
        firstChars(cleanExcerpt, 160),
      ogImage: post.seo?.opengraphImage?.sourceUrl || post.featuredImage?.node?.sourceUrl,
      canonical: post.seo?.canonical,
      noindex: post.seo?.metaRobotsNoindex === 'noindex',
      nofollow: post.seo?.metaRobotsNofollow === 'nofollow',
    },
  };
}

/**
 * Get all published posts
 */
export async function getAllPosts(limit = 100): Promise<BlogPost[]> {
  const data = await fetchGraphQLWithTags<WordPressPostsResponse>(GET_ALL_POSTS, { first: limit }, [
    'posts',
  ]);

  return data.posts.nodes.map(transformPost);
}

/**
 * Get recent posts for blog index
 */
export async function getRecentPosts(
  limit = 10,
  { revalidate }: { revalidate?: number } = {}
): Promise<BlogPost[]> {
  const data = await fetchGraphQLWithTags<WordPressPostsResponse>(
    GET_RECENT_POSTS,
    { first: limit },
    ['posts'],
    revalidate
  );

  return data.posts.nodes.map(transformPost);
}

/** WPGraphQL's default ceiling on `first`; asking for more returns 100 anyway. */
const SUMMARY_PAGE_SIZE = 100;

/**
 * Published posts as summaries, newest first, up to `limit` of them.
 *
 * Pages through WordPress with its cursor, so `limit` can be larger than the
 * 100 WPGraphQL hands out per request. Without the body, a hundred summaries
 * are a few kilobytes, which is what lets the blog index ask for every post.
 */
export async function getPostSummaries({
  limit,
  revalidate,
}: {
  limit: number;
  revalidate?: number;
}): Promise<BlogPostSummary[]> {
  const posts: BlogPostSummary[] = [];
  let after: string | null = null;

  while (posts.length < limit) {
    const data: WordPressPostSummariesResponse =
      await fetchGraphQLWithTags<WordPressPostSummariesResponse>(
        GET_POST_SUMMARIES,
        { first: Math.min(SUMMARY_PAGE_SIZE, limit - posts.length), after },
        ['posts'],
        revalidate
      );

    posts.push(...data.posts.nodes.map(transformPostSummary));

    const { hasNextPage, endCursor } = data.posts.pageInfo;
    // A page with no cursor cannot be followed, whatever hasNextPage says.
    if (!hasNextPage || !endCursor) break;
    after = endCursor;
  }

  return posts;
}

/**
 * Get a single post by slug
 */
export async function getPostBySlug(slug: string): Promise<BlogPost | null> {
  const data = await fetchGraphQLWithTags<WordPressPostBySlugResponse>(GET_POST_BY_SLUG, { slug }, [
    'posts',
    `post-${slug}`,
  ]);

  if (!data.post) {
    return null;
  }

  return transformPost(data.post);
}

/**
 * Every published post's slug and the date WordPress last saw it change, for
 * the sitemap. Pages through the whole list, 100 at a time.
 *
 * `revalidate` is how long each page of the list may be cached. A route is
 * regenerated as often as its shortest-lived fetch, so a route that is meant
 * to be rebuilt hourly has to ask for an hour here too, not the default minute.
 */
export async function getAllPostSitemapData({
  revalidate = 60,
}: { revalidate?: number } = {}): Promise<Array<Pick<BlogPost, 'slug' | 'modifiedDate'>>> {
  const posts: Array<Pick<BlogPost, 'slug' | 'modifiedDate'>> = [];
  let hasNextPage = true;
  let after: string | null = null;

  while (hasNextPage) {
    const data: WordPressPostsResponse = await fetchGraphQL<WordPressPostsResponse>(
      GET_ALL_POST_SLUGS,
      { first: 100, after },
      { next: { revalidate } }
    );

    posts.push(
      ...data.posts.nodes.map((post: WordPressPost) => ({
        slug: post.slug,
        // WPGraphQL's `modified` is the site's local time with no offset, so
        // it would be read as whatever zone the server runs in. `modifiedGmt`
        // is UTC; gmtToIso marks it as such.
        modifiedDate: gmtToIso(post.modifiedGmt) ?? '',
      }))
    );

    hasNextPage = data.posts.pageInfo.hasNextPage;
    after = data.posts.pageInfo.endCursor;
  }

  return posts;
}

/**
 * Get posts by category
 */
export async function getPostsByCategory(categorySlug: string, limit = 10): Promise<BlogPost[]> {
  const data = await fetchGraphQLWithTags<WordPressPostsResponse>(
    GET_POSTS_BY_CATEGORY,
    { categorySlug, first: limit },
    ['posts', `category-${categorySlug}`]
  );

  return data.posts.nodes.map(transformPost);
}

/**
 * Up to `limit` posts to read after `post`: the newest in its categories,
 * topped up with the newest overall when its categories run short, never
 * `post` itself or the same post twice. Summaries, without bodies.
 *
 * Takes the post the page already has. It used to take a slug and fetch the
 * post twice more - once for its categories, once for its database ID - each
 * time with the full body, before asking for the related posts themselves.
 */
export async function getRelatedPosts(
  post: Pick<BlogPost, 'slug' | 'categories'>,
  limit = 3
): Promise<BlogPostSummary[]> {
  const related: BlogPostSummary[] = [];
  const seen = new Set([post.slug]);
  const take = (candidates: BlogPostSummary[]) => {
    for (const candidate of candidates) {
      if (related.length >= limit) return;
      if (seen.has(candidate.slug)) continue;
      seen.add(candidate.slug);
      related.push(candidate);
    }
  };

  if (post.categories.length > 0) {
    const data = await fetchGraphQLWithTags<WordPressPostSummariesResponse>(
      GET_RELATED_POST_SUMMARIES,
      // One more than needed: the post itself is in its own categories.
      { categoryIn: post.categories.map((category) => category.id), first: limit + 1 },
      ['posts']
    );
    take(data.posts.nodes.map(transformPostSummary));
  }

  if (related.length < limit) {
    // Enough to fill the gap even if every one already shown comes first.
    take(await getPostSummaries({ limit: limit + related.length + 1 }));
  }

  return related;
}

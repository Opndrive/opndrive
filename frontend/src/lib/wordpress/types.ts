import type { AuthorSocial } from './seo-text';

/**
 * WordPress GraphQL Types
 * Type-safe definitions for WordPress content
 */

export interface WordPressPost {
  id: string;
  databaseId: number;
  slug: string;
  /** Asked for by the lookup by slug only: `publish` for a published post. */
  status?: string | null;
  title: string;
  excerpt: string;
  content: string;
  date: string;
  /** UTC, without a zone suffix. */
  dateGmt?: string;
  modified: string;
  /** UTC, without a zone suffix. Only the sitemap query asks for it. */
  modifiedGmt?: string;
  author: WordPressAuthor;
  featuredImage?: WordPressFeaturedImage;
  categories: {
    nodes: CategoryNode[];
  };
  tags: {
    nodes: TagNode[];
  };
  seo?: WordPressSEO; // Optional - only if Yoast SEO is installed
}

export interface WordPressAuthor {
  node: WordPressUser;
}

/** A WordPress user, as the author fragment and the author query return it. */
export interface WordPressUser {
  name: string;
  slug?: string;
  /** The website on their profile. */
  url?: string | null;
  firstName?: string;
  lastName?: string;
  avatar?: {
    url: string;
  } | null;
  description?: string | null;
  seo?: { social?: AuthorSocial | null } | null;
}

export interface WordPressFeaturedImage {
  node: {
    sourceUrl: string;
    altText: string;
    mediaDetails: {
      width: number;
      height: number;
    };
    sizes?: string;
  };
}

export interface WordPressCategory {
  node: {
    id: string;
    name: string;
    slug: string;
  };
}

export interface WordPressTag {
  node: {
    id: string;
    name: string;
    slug: string;
  };
}

// Simplified category/tag structure (for arrays)
export interface CategoryNode {
  id: string;
  name: string;
  slug: string;
  /** Published posts in the category, as WordPress counts them. */
  count?: number | null;
}

export interface TagNode {
  id: string;
  name: string;
  slug: string;
}

export interface WordPressSEO {
  title?: string;
  metaDesc?: string;
  metaKeywords?: string;
  opengraphTitle?: string;
  opengraphDescription?: string;
  opengraphImage?: {
    sourceUrl: string;
    altText: string;
  };
  twitterTitle?: string;
  twitterDescription?: string;
  twitterImage?: {
    sourceUrl: string;
  };
  canonical?: string;
  focuskw?: string;
  metaRobotsNoindex?: string;
  metaRobotsNofollow?: string;
}

export interface WordPressPostsResponse {
  posts: {
    nodes: WordPressPost[];
    pageInfo: {
      hasNextPage: boolean;
      hasPreviousPage: boolean;
      startCursor: string;
      endCursor: string;
    };
  };
}

/** A post as GET_POST_SUMMARIES returns it: no body or tags, and only the SEO description. */
export type WordPressPostSummary = Omit<WordPressPost, 'content' | 'tags' | 'seo'> & {
  seo?: Pick<WordPressSEO, 'metaDesc'> | null;
};

export interface WordPressPostSummariesResponse {
  posts: {
    nodes: WordPressPostSummary[];
    pageInfo: {
      hasNextPage: boolean;
      endCursor: string | null;
    };
  };
}

export interface WordPressPostResponse {
  post: WordPressPost | null;
}

export interface WordPressPostBySlugResponse {
  post: WordPressPost | null;
  /** WordPress's own site name, which Yoast's title templates end with. */
  generalSettings?: { title?: string | null } | null;
}

export interface WordPressAuthorResponse {
  user:
    | (WordPressUser & {
        slug: string;
        posts: { nodes: WordPressPostSummary[] };
      })
    | null;
}

export interface WordPressCategoryHubResponse {
  category: {
    name: string;
    slug: string;
    description?: string | null;
    count?: number | null;
    posts: { nodes: WordPressPostSummary[] };
  } | null;
}

// Simplified types for frontend consumption
export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  /**
   * When the post was published, as an ISO string in UTC (from WPGraphQL's
   * `dateGmt`). This is the exact instant, for everything a machine reads: Open
   * Graph, article meta tags, structured data, `<time dateTime>`, the feed.
   * Every post query selects `dateGmt`, which WPGraphQL gives for every
   * published post; only a query without it falls back to the local time.
   */
  publishedDate: string;
  /**
   * The publish date as the site's own clock gave it, with no offset - what the
   * author saw in WordPress. Only for showing the date to readers: parsed
   * without a zone, it gives the same calendar day wherever it is rendered,
   * where the UTC instant could fall on the day before or after.
   */
  publishedDateLocal: string;
  /** When the post last changed, as an ISO string in UTC (from `modifiedGmt`). */
  modifiedDate: string;
  /**
   * The last change as the site's own clock gave it, with no offset. Only for
   * showing to readers, for the same reason as `publishedDateLocal`.
   */
  modifiedDateLocal: string;
  author: BlogAuthor;
  /**
   * What search results show under the title: the Yoast meta description in
   * full, or the excerpt cut at a word under 160 characters.
   */
  description: string;
  featuredImage?: {
    url: string;
    alt: string;
    width: number;
    height: number;
  };
  categories: Array<{
    id: string;
    name: string;
    slug: string;
    /** Published posts in it; decides whether it has a hub page. */
    count?: number;
  }>;
  tags: Array<{
    id: string;
    name: string;
    slug: string;
  }>;
  seo: {
    /** The Yoast search title, for <title>, og:title and twitter:title. */
    title: string;
    /** The same as `description`, for every description tag. */
    description: string;
    ogImage?: string;
    noindex?: boolean;
    nofollow?: boolean;
  };
}

/** Who wrote a post, as the byline, the profile page and the structured data show them. */
export interface BlogAuthor {
  name: string;
  /** The WordPress user's slug, which names their profile at /blog/author/<slug>. */
  slug?: string;
  avatar?: string;
  /** Plain text; empty when the profile has none. */
  bio?: string;
  /** Their website and social profiles, for the structured data's `sameAs`. */
  sameAs: string[];
}

/**
 * A post as a list shows it: a card on the blog index, an item in the feed, a
 * related post. Everything but the body and the SEO overrides, which only the
 * post's own page reads.
 */
export type BlogPostSummary = Omit<BlogPost, 'content' | 'seo'>;

export interface PaginationInfo {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  total?: number;
}

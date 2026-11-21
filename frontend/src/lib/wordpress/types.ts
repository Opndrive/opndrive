/**
 * WordPress GraphQL Types
 * Type-safe definitions for WordPress content
 */

export interface WordPressPost {
  id: string;
  databaseId: number;
  slug: string;
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
  node: {
    name: string;
    firstName?: string;
    lastName?: string;
    avatar?: {
      url: string;
    };
    description?: string;
  };
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

/** A post as GET_POST_SUMMARIES returns it: no body, tags or SEO fields. */
export type WordPressPostSummary = Omit<WordPressPost, 'content' | 'tags' | 'seo'>;

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
  author: {
    name: string;
    avatar?: string;
    bio?: string;
  };
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
  }>;
  tags: Array<{
    id: string;
    name: string;
    slug: string;
  }>;
  seo: {
    title: string;
    description: string;
    ogTitle?: string;
    ogDescription?: string;
    ogImage?: string;
    canonical?: string;
    noindex?: boolean;
    nofollow?: boolean;
  };
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

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
  modified: string;
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
  publishedDate: string;
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

export interface PaginationInfo {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  total?: number;
}

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
  GET_RELATED_POSTS,
} from './queries-simple'; // Using simplified queries without SEO
import type {
  WordPressPostsResponse,
  WordPressPostBySlugResponse,
  BlogPost,
  WordPressPost,
  CategoryNode,
  TagNode,
} from './types';

/**
 * Transform WordPress post to simplified BlogPost format
 */
function transformPost(post: WordPressPost): BlogPost {
  // Clean excerpt (remove HTML tags)
  const cleanExcerpt = post.excerpt ? post.excerpt.replace(/<[^>]*>/g, '').trim() : '';

  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    excerpt: cleanExcerpt,
    content: post.content,
    publishedDate: post.date,
    modifiedDate: post.modified,
    author: {
      name: post.author?.node?.name || 'Anonymous',
      avatar: post.author?.node?.avatar?.url,
      bio: post.author?.node?.description,
    },
    featuredImage: post.featuredImage?.node
      ? {
          url: post.featuredImage.node.sourceUrl,
          alt: post.featuredImage.node.altText || post.title,
          width: post.featuredImage.node.mediaDetails?.width || 1200,
          height: post.featuredImage.node.mediaDetails?.height || 630,
        }
      : undefined,
    categories:
      post.categories?.nodes?.map((cat: CategoryNode) => ({
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
      })) || [],
    tags:
      post.tags?.nodes?.map((tag: TagNode) => ({
        id: tag.id,
        name: tag.name,
        slug: tag.slug,
      })) || [],
    seo: {
      title: post.seo?.title || post.title,
      description: post.seo?.metaDesc || cleanExcerpt.substring(0, 160),
      ogTitle: post.seo?.opengraphTitle || post.seo?.title || post.title,
      ogDescription:
        post.seo?.opengraphDescription || post.seo?.metaDesc || cleanExcerpt.substring(0, 160),
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
export async function getRecentPosts(limit = 10): Promise<BlogPost[]> {
  const data = await fetchGraphQLWithTags<WordPressPostsResponse>(
    GET_RECENT_POSTS,
    { first: limit },
    ['posts']
  );

  return data.posts.nodes.map(transformPost);
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
 * Get all post slugs for static generation
 */
export async function getAllPostSlugs(): Promise<string[]> {
  const slugs: string[] = [];
  let hasNextPage = true;
  let after: string | null = null;

  while (hasNextPage) {
    const data: WordPressPostsResponse = await fetchGraphQL<WordPressPostsResponse>(
      GET_ALL_POST_SLUGS,
      { first: 100, after }
    );

    slugs.push(...data.posts.nodes.map((post: WordPressPost) => post.slug));

    hasNextPage = data.posts.pageInfo.hasNextPage;
    after = data.posts.pageInfo.endCursor;
  }

  return slugs;
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
 * Get related posts based on current post's categories
 */
export async function getRelatedPosts(currentPostSlug: string, limit = 3): Promise<BlogPost[]> {
  try {
    // First, get the current post to extract its categories
    const currentPost = await getPostBySlug(currentPostSlug);

    if (!currentPost || !currentPost.categories || currentPost.categories.length === 0) {
      // Fallback to recent posts if no categories
      return getRecentPosts(limit);
    }

    // Get category IDs
    const categoryIds = currentPost.categories.map((cat) => cat.id);

    // Get database ID of current post to exclude it
    const currentPostData = await fetchGraphQL<WordPressPostBySlugResponse>(GET_POST_BY_SLUG, {
      slug: currentPostSlug,
    });

    const currentPostId = currentPostData.post?.databaseId;

    // Fetch related posts
    const data = await fetchGraphQL<WordPressPostsResponse>(GET_RELATED_POSTS, {
      categoryIn: categoryIds,
      notIn: currentPostId ? [currentPostId] : [],
      first: limit,
    });

    const relatedPosts = data.posts.nodes.map(transformPost);

    // If we don't have enough related posts, fill with recent posts
    if (relatedPosts.length < limit) {
      const recentPosts = await getRecentPosts(limit);
      const additionalPosts = recentPosts
        .filter((post) => post.slug !== currentPostSlug)
        .slice(0, limit - relatedPosts.length);

      return [...relatedPosts, ...additionalPosts];
    }

    return relatedPosts;
  } catch (error) {
    console.error('Error fetching related posts:', error);
    // Fallback to recent posts on error
    return getRecentPosts(limit);
  }
}

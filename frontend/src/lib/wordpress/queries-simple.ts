/**
 * WordPress GraphQL Queries - Simplified Version
 * Works without Yoast SEO plugin
 */

/**
 * Fragment for post author data
 */
export const AUTHOR_FRAGMENT = `
  fragment AuthorFields on NodeWithAuthorToUserConnectionEdge {
    node {
      name
      firstName
      lastName
      avatar {
        url
      }
      description
    }
  }
`;

/**
 * Fragment for featured image data
 */
export const FEATURED_IMAGE_FRAGMENT = `
  fragment FeaturedImageFields on NodeWithFeaturedImageToMediaItemConnectionEdge {
    node {
      sourceUrl
      altText
      mediaDetails {
        width
        height
      }
    }
  }
`;

/**
 * Complete post fields fragment (without SEO)
 */
export const POST_FIELDS = `
  fragment PostFields on Post {
    id
    databaseId
    slug
    title
    excerpt
    content
    date
    modified
    author {
      ...AuthorFields
    }
    featuredImage {
      ...FeaturedImageFields
    }
    categories {
      nodes {
        id
        name
        slug
      }
    }
    tags {
      nodes {
        id
        name
        slug
      }
    }
  }
`;

/**
 * Query to fetch all published posts with pagination
 */
export const GET_ALL_POSTS = `
  query GetAllPosts($first: Int = 100, $after: String) {
    posts(first: $first, after: $after, where: { status: PUBLISH }) {
      nodes {
        ...PostFields
      }
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
    }
  }
  ${POST_FIELDS}
  ${AUTHOR_FRAGMENT}
  ${FEATURED_IMAGE_FRAGMENT}
`;

/**
 * Query to fetch recent posts (for blog index)
 */
export const GET_RECENT_POSTS = `
  query GetRecentPosts($first: Int = 10) {
    posts(first: $first, where: { status: PUBLISH, orderby: { field: DATE, order: DESC } }) {
      nodes {
        ...PostFields
      }
      pageInfo {
        hasNextPage
        hasPreviousPage
      }
    }
  }
  ${POST_FIELDS}
  ${AUTHOR_FRAGMENT}
  ${FEATURED_IMAGE_FRAGMENT}
`;

/**
 * Query to fetch a single post by slug
 */
export const GET_POST_BY_SLUG = `
  query GetPostBySlug($slug: ID!) {
    post(id: $slug, idType: SLUG) {
      ...PostFields
    }
  }
  ${POST_FIELDS}
  ${AUTHOR_FRAGMENT}
  ${FEATURED_IMAGE_FRAGMENT}
`;

/**
 * Query to fetch all post slugs (for static generation)
 */
export const GET_ALL_POST_SLUGS = `
  query GetAllPostSlugs($first: Int = 100, $after: String) {
    posts(first: $first, after: $after, where: { status: PUBLISH }) {
      nodes {
        slug
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

/**
 * Query to fetch posts by category
 */
export const GET_POSTS_BY_CATEGORY = `
  query GetPostsByCategory($categorySlug: String!, $first: Int = 10) {
    posts(
      first: $first
      where: {
        status: PUBLISH
        categoryName: $categorySlug
        orderby: { field: DATE, order: DESC }
      }
    ) {
      nodes {
        ...PostFields
      }
      pageInfo {
        hasNextPage
      }
    }
  }
  ${POST_FIELDS}
  ${AUTHOR_FRAGMENT}
  ${FEATURED_IMAGE_FRAGMENT}
`;

/**
 * Query to fetch posts by tag
 */
export const GET_POSTS_BY_TAG = `
  query GetPostsByTag($tagSlug: String!, $first: Int = 10) {
    posts(
      first: $first
      where: {
        status: PUBLISH
        tag: $tagSlug
        orderby: { field: DATE, order: DESC }
      }
    ) {
      nodes {
        ...PostFields
      }
      pageInfo {
        hasNextPage
      }
    }
  }
  ${POST_FIELDS}
  ${AUTHOR_FRAGMENT}
  ${FEATURED_IMAGE_FRAGMENT}
`;

/**
 * Query to fetch related posts based on categories
 */
export const GET_RELATED_POSTS = `
  query GetRelatedPosts($categoryIn: [ID!], $notIn: [ID!], $first: Int = 3) {
    posts(
      first: $first
      where: {
        status: PUBLISH
        categoryIn: $categoryIn
        notIn: $notIn
        orderby: { field: DATE, order: DESC }
      }
    ) {
      nodes {
        ...PostFields
      }
    }
  }
  ${POST_FIELDS}
  ${AUTHOR_FRAGMENT}
  ${FEATURED_IMAGE_FRAGMENT}
`;

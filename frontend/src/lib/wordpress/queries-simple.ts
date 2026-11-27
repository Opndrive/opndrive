/**
 * WordPress GraphQL Queries.
 *
 * The blog's WordPress runs Yoast SEO with WPGraphQL for Yoast SEO, which adds
 * the `seo` fields below: the search title and description editors set in
 * Yoast, its robots choices, and the social profiles on a user. Yoast's
 * `canonical` is deliberately not asked for: it is the post's address on the
 * WordPress server, and a post's canonical is always its own address here.
 */

/**
 * Fragment for post author data
 */
export const AUTHOR_FRAGMENT = `
  fragment AuthorFields on NodeWithAuthorToUserConnectionEdge {
    node {
      name
      slug
      url
      firstName
      lastName
      avatar {
        url
      }
      description
      seo {
        social {
          twitter
          linkedIn
          facebook
          youTube
          wikipedia
          instagram
        }
      }
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
    dateGmt
    modified
    modifiedGmt
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
        count
      }
    }
    tags {
      nodes {
        id
        name
        slug
      }
    }
    seo {
      title
      metaDesc
      metaRobotsNoindex
      metaRobotsNofollow
      opengraphImage {
        sourceUrl
      }
    }
  }
`;

/**
 * What a list of posts needs to draw a card: everything but the body.
 *
 * A post's `content` is the whole article, tens of kilobytes of HTML, and the
 * blog index, the feed and the related posts never show it. Leaving it out is
 * what makes it cheap to ask for every post rather than the newest fifty.
 */
export const POST_SUMMARY_FIELDS = `
  fragment PostSummaryFields on Post {
    id
    databaseId
    slug
    title
    excerpt
    date
    dateGmt
    modified
    modifiedGmt
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
        count
      }
    }
    seo {
      metaDesc
    }
  }
`;

/**
 * Published posts as summaries, newest first, a page at a time. `$after` is
 * the cursor from the previous page's `pageInfo.endCursor`.
 */
export const GET_POST_SUMMARIES = `
  query GetPostSummaries($first: Int = 100, $after: String) {
    posts(
      first: $first
      after: $after
      where: { status: PUBLISH, orderby: { field: DATE, order: DESC } }
    ) {
      nodes {
        ...PostSummaryFields
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
  ${POST_SUMMARY_FIELDS}
  ${AUTHOR_FRAGMENT}
  ${FEATURED_IMAGE_FRAGMENT}
`;

/**
 * Summaries of the newest posts in any of the given categories, for a post's
 * related posts. WPGraphQL takes the categories' global or database IDs.
 */
export const GET_RELATED_POST_SUMMARIES = `
  query GetRelatedPostSummaries($categoryIn: [ID], $first: Int = 4) {
    posts(
      first: $first
      where: { status: PUBLISH, categoryIn: $categoryIn, orderby: { field: DATE, order: DESC } }
    ) {
      nodes {
        ...PostSummaryFields
      }
    }
  }
  ${POST_SUMMARY_FIELDS}
  ${AUTHOR_FRAGMENT}
  ${FEATURED_IMAGE_FRAGMENT}
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
      status
    }
    generalSettings {
      title
    }
  }
  ${POST_FIELDS}
  ${AUTHOR_FRAGMENT}
  ${FEATURED_IMAGE_FRAGMENT}
`;

/**
 * A post by its database ID, in any status: the editors' preview. Only
 * answered with a draft when the request is signed in as someone who may
 * read it.
 */
export const GET_PREVIEW_POST = `
  query GetPreviewPost($id: ID!) {
    post(id: $id, idType: DATABASE_ID) {
      ...PostFields
    }
    generalSettings {
      title
    }
  }
  ${POST_FIELDS}
  ${AUTHOR_FRAGMENT}
  ${FEATURED_IMAGE_FRAGMENT}
`;

/**
 * Query to fetch every published post's slug and last-modified date, for the
 * sitemap
 */
export const GET_ALL_POST_SLUGS = `
  query GetAllPostSlugs($first: Int = 100, $after: String) {
    posts(first: $first, after: $after, where: { status: PUBLISH }) {
      nodes {
        slug
        modifiedGmt
        author {
          node {
            slug
          }
        }
        categories {
          nodes {
            slug
            count
          }
        }
        seo {
          metaRobotsNoindex
        }
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
 * An author's profile: who they are and what they have published, newest
 * first. WPGraphQL only shows a user who has published something, so an
 * author with no posts is not found.
 */
export const GET_AUTHOR = `
  query GetAuthor($slug: ID!) {
    user(id: $slug, idType: SLUG) {
      name
      slug
      url
      description
      avatar(size: 192) {
        url
      }
      seo {
        social {
          twitter
          linkedIn
          facebook
          youTube
          wikipedia
          instagram
        }
      }
      posts(first: 100, where: { status: PUBLISH, orderby: { field: DATE, order: DESC } }) {
        nodes {
          ...PostSummaryFields
        }
      }
    }
  }
  ${POST_SUMMARY_FIELDS}
  ${AUTHOR_FRAGMENT}
  ${FEATURED_IMAGE_FRAGMENT}
`;

/**
 * A topic's hub: the category, its description and its published posts,
 * newest first. `count` is WordPress's count of the category's published
 * posts, which is what decides whether it has a hub at all.
 */
export const GET_CATEGORY_HUB = `
  query GetCategoryHub($slug: ID!) {
    category(id: $slug, idType: SLUG) {
      name
      slug
      description
      count
      posts(first: 100, where: { status: PUBLISH, orderby: { field: DATE, order: DESC } }) {
        nodes {
          ...PostSummaryFields
        }
      }
    }
  }
  ${POST_SUMMARY_FIELDS}
  ${AUTHOR_FRAGMENT}
  ${FEATURED_IMAGE_FRAGMENT}
`;

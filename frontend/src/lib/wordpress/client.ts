/**
 * WordPress GraphQL Client
 * Secure client for fetching WordPress content via WPGraphQL
 * Ensures WordPress endpoint is never exposed to the client
 */

import { isBlogEnabled, requiresWordPressCredentials } from '@/config/features';

/**
 * Whether there is a WordPress to ask at all: the blog is on and its GraphQL
 * URL is set. Not the same as WordPress answering - callers that treat a
 * failed request as "unknown" use this to tell a blog with no source (nothing
 * to show, ever) from one whose source did not answer this time.
 */
export function isWordPressConfigured(): boolean {
  return missingWordPressConfig() === null;
}

/** What stops WordPress being used, or null when nothing does. One rule for both callers. */
function missingWordPressConfig(): string | null {
  if (!isBlogEnabled()) {
    return 'Blog feature is disabled. Set NEXT_PUBLIC_ENABLE_BLOG=true to enable it.';
  }
  // Only require credentials if using self-hosted WordPress
  if (!requiresWordPressCredentials()) {
    return 'WordPress is not configured for this deployment.';
  }
  if (!process.env.WORDPRESS_GRAPHQL_URL) {
    return (
      'WORDPRESS_GRAPHQL_URL environment variable is not defined. ' +
      'Either set it or disable the blog feature with NEXT_PUBLIC_ENABLE_BLOG=false'
    );
  }
  return null;
}

// Lazy evaluation - only check when actually used
const getWordPressConfig = () => {
  const missing = missingWordPressConfig();
  if (missing) throw new Error(missing);

  return { WORDPRESS_API_URL: process.env.WORDPRESS_GRAPHQL_URL! };
};

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{
    message: string;
    locations?: Array<{ line: number; column: number }>;
    path?: string[];
  }>;
}

interface FetchOptions {
  cache?: RequestCache;
  next?: {
    revalidate?: number | false;
    tags?: string[];
  };
  /** Extra request headers. Only the preview request sends any. */
  headers?: Record<string, string>;
}

type GraphQLVariables = Record<
  string,
  string | number | boolean | string[] | number[] | null | undefined
>;

/**
 * Execute a GraphQL query against WordPress
 * All requests are server-side only
 */
export async function fetchGraphQL<T>(
  query: string,
  variables: GraphQLVariables = {},
  options: FetchOptions = {}
): Promise<T> {
  // Ensure this only runs on the server
  if (typeof window !== 'undefined') {
    throw new Error('WordPress GraphQL client can only be used server-side');
  }

  // Silent fail if blog is disabled - callers should check isBlogEnabled() first
  if (!isBlogEnabled()) {
    throw new Error('Blog feature is disabled');
  }

  const { WORDPRESS_API_URL } = getWordPressConfig();

  // No credential here. Everything the public blog shows is published and
  // public, and a logged-in request could be answered with a draft: a post
  // looked up by slug that is still unpublished. Only the preview, below,
  // signs in, and it never shares a cache with these requests.
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  try {
    const response = await fetch(WORDPRESS_API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        query,
        variables,
      }),
      // Default caching strategy - can be overridden
      cache: options.cache || 'force-cache',
      // A no-store request (the preview) has no revalidate interval at all.
      ...(options.cache === 'no-store' ? {} : { next: options.next || { revalidate: 60 } }), // 60 seconds by default
    });

    if (!response.ok) {
      throw new Error(
        `WordPress GraphQL request failed: ${response.status} ${response.statusText}`
      );
    }

    const json: GraphQLResponse<T> = await response.json();

    if (json.errors) {
      console.error('GraphQL Errors:', json.errors);
      throw new Error(`GraphQL Error: ${json.errors.map((e) => e.message).join(', ')}`);
    }

    if (!json.data) {
      throw new Error('No data returned from GraphQL query');
    }

    return json.data;
  } catch (error) {
    console.error('WordPress GraphQL fetch error:', error);
    throw error;
  }
}

/**
 * Fetch with custom cache tags for on-demand revalidation.
 *
 * `revalidate` defaults to a minute. A route that is meant to be regenerated
 * less often has to pass its own interval: Next.js regenerates a route as
 * often as its shortest-lived fetch, whatever the route itself exports.
 */
export async function fetchGraphQLWithTags<T>(
  query: string,
  variables: GraphQLVariables = {},
  tags: string[],
  revalidate = 60
): Promise<T> {
  return fetchGraphQL<T>(query, variables, {
    next: {
      tags,
      revalidate,
    },
  });
}

/**
 * Whether the preview can sign in: both halves of the previewer's
 * application password are set. The preview route answers 404 without them.
 */
export function isPreviewConfigured(): boolean {
  return Boolean(process.env.WORDPRESS_PREVIEW_USER && process.env.WORDPRESS_PREVIEW_APP_PASSWORD);
}

/**
 * A request signed in as the previewer, for the editors' draft preview only.
 *
 * The previewer is a WordPress user with a read-only role (see
 * wordpress/mu-plugins/opndrive-preview.php) and an application password,
 * which WordPress accepts over HTTP Basic auth. Never cached: a draft must
 * not be kept where a public request could find it. `X-GraphQL-Preview` asks
 * WPGraphQL to overlay the latest autosave when the user may see it; where it
 * may not, or an older WPGraphQL does not know the header, the saved draft is
 * returned unchanged.
 */
export async function fetchPreviewGraphQL<T>(
  query: string,
  variables: GraphQLVariables,
  postId: number
): Promise<T> {
  const user = process.env.WORDPRESS_PREVIEW_USER;
  const password = process.env.WORDPRESS_PREVIEW_APP_PASSWORD;
  if (!user || !password) {
    throw new Error('The draft preview is not configured for this deployment.');
  }

  return fetchGraphQL<T>(query, variables, {
    cache: 'no-store',
    headers: {
      Authorization: `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`,
      'X-GraphQL-Preview': `database_id=${postId}`,
    },
  });
}

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
  return isBlogEnabled() && Boolean(process.env.WORDPRESS_GRAPHQL_URL);
}

// Lazy evaluation - only check when actually used
const getWordPressConfig = () => {
  // Check if blog feature is enabled
  if (!isBlogEnabled()) {
    throw new Error('Blog feature is disabled. Set NEXT_PUBLIC_ENABLE_BLOG=true to enable it.');
  }

  // Only require credentials if using self-hosted WordPress
  if (!requiresWordPressCredentials()) {
    throw new Error('WordPress is not configured for this deployment.');
  }

  const WORDPRESS_API_URL = process.env.WORDPRESS_GRAPHQL_URL || '';
  const WP_AUTH_TOKEN = process.env.WORDPRESS_AUTH_TOKEN;

  if (!WORDPRESS_API_URL) {
    throw new Error(
      'WORDPRESS_GRAPHQL_URL environment variable is not defined. ' +
        'Either set it or disable the blog feature with NEXT_PUBLIC_ENABLE_BLOG=false'
    );
  }

  return { WORDPRESS_API_URL, WP_AUTH_TOKEN };
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

  const { WORDPRESS_API_URL, WP_AUTH_TOKEN } = getWordPressConfig();

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  // Add authentication if token is available
  if (WP_AUTH_TOKEN) {
    headers['Authorization'] = `Bearer ${WP_AUTH_TOKEN}`;
  }

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
      next: options.next || {
        revalidate: 60, // Revalidate every 60 seconds by default
      },
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
 * Fetch without caching (for preview or draft content)
 */
export async function fetchGraphQLNoCache<T>(
  query: string,
  variables: GraphQLVariables = {}
): Promise<T> {
  return fetchGraphQL<T>(query, variables, {
    cache: 'no-store',
  });
}

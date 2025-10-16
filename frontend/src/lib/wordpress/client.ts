/**
 * WordPress GraphQL Client
 * Secure client for fetching WordPress content via WPGraphQL
 * Ensures WordPress endpoint is never exposed to the client
 */

// Lazy evaluation - only check when actually used
const getWordPressConfig = () => {
  const WORDPRESS_API_URL = process.env.WORDPRESS_GRAPHQL_URL || '';
  const WP_AUTH_TOKEN = process.env.WORDPRESS_AUTH_TOKEN;

  if (!WORDPRESS_API_URL) {
    throw new Error('WORDPRESS_GRAPHQL_URL environment variable is not defined');
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
 * Fetch with custom cache tags for on-demand revalidation
 */
export async function fetchGraphQLWithTags<T>(
  query: string,
  variables: GraphQLVariables = {},
  tags: string[]
): Promise<T> {
  return fetchGraphQL<T>(query, variables, {
    next: {
      tags,
      revalidate: 60,
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

/**
 * Feature Flags Configuration
 * Control which features are enabled in the application
 */

export const FEATURE_FLAGS = {
  /**
   * Enable blog/WordPress integration
   * Set to false to completely disable blog routes and WordPress dependency
   *
   * Environment variable: NEXT_PUBLIC_ENABLE_BLOG
   */
  BLOG_ENABLED: process.env.NEXT_PUBLIC_ENABLE_BLOG !== 'false',
} as const;

/**
 * Check if blog feature is enabled
 */
export function isBlogEnabled(): boolean {
  return FEATURE_FLAGS.BLOG_ENABLED;
}

/**
 * Check if WordPress credentials are required
 */
export function requiresWordPressCredentials(): boolean {
  return isBlogEnabled();
}

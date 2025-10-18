/**
 * SEO Configuration
 * Centralized SEO settings for the entire application
 */

export const SEO_CONFIG = {
  // Site Information
  siteName: 'Opndrive',
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || 'https://opndrive.app',
  siteDescription:
    'Open-source modern UI for S3 Compatible Storage Services. Manage your cloud storage with full control over your data.',

  // Default Metadata
  defaultTitle: 'Opndrive - Open Source S3 Storage Manager',
  titleTemplate: '%s | Opndrive',

  // Social Media
  twitterHandle: '@opndrive',
  twitterCreator: '@opndrive',

  // Open Graph
  ogType: 'website',
  ogImage: '/og-image.png', // Create this image (1200x630px)
  ogImageWidth: 1200,
  ogImageHeight: 630,

  // Blog Specific
  blog: {
    title: 'Opndrive Blog - Cloud Storage Insights & Tutorials',
    description:
      'Learn about cloud storage management, S3 best practices, file organization tips, and productivity guides for managing your data effectively.',
    ogImage: '/og-blog.png', // Create this image
    articlesPerPage: 10,
  },

  // Structured Data
  organization: {
    name: 'Opndrive',
    url: 'https://opndrive.app',
    logo: 'https://opndrive.app/logo.png',
    sameAs: [
      'https://github.com/opndrive/opndrive',
      'https://twitter.com/opndrive',
      // Add more social profiles
    ],
  },

  // Author Information (for blog posts)
  defaultAuthor: {
    name: 'Opndrive Team',
    url: 'https://opndrive.app/about',
  },
};

/**
 * Generate absolute URL
 */
export function getAbsoluteUrl(path: string): string {
  return `${SEO_CONFIG.siteUrl}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * Generate optimized title
 */
export function generateTitle(title?: string): string {
  if (!title) return SEO_CONFIG.defaultTitle;
  return `${title} | ${SEO_CONFIG.siteName}`;
}

/**
 * Truncate description to optimal length (155-160 characters)
 */
export function optimizeDescription(description: string, maxLength = 155): string {
  if (description.length <= maxLength) return description;
  return description.substring(0, maxLength - 3).trim() + '...';
}

/**
 * Generate keywords from tags and categories
 */
export function generateKeywords(
  tags: string[],
  categories: string[],
  additionalKeywords: string[] = []
): string {
  const baseKeywords = ['opndrive', 's3 storage', 'cloud storage', 'file management'];
  const allKeywords = [...baseKeywords, ...tags, ...categories, ...additionalKeywords];
  const uniqueKeywords = Array.from(new Set(allKeywords));
  return uniqueKeywords.join(', ');
}

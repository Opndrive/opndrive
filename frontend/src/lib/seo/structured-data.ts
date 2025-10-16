/**
 * Structured Data (JSON-LD) Generators
 * Generate schema.org structured data for better SEO
 */

import { SEO_CONFIG } from './config';
import type { BlogPost } from '@/lib/wordpress/types';

/**
 * Generate Organization Schema
 */
export function generateOrganizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SEO_CONFIG.organization.name,
    url: SEO_CONFIG.organization.url,
    logo: SEO_CONFIG.organization.logo,
    sameAs: SEO_CONFIG.organization.sameAs,
  };
}

/**
 * Generate WebSite Schema
 */
export function generateWebSiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SEO_CONFIG.siteName,
    url: SEO_CONFIG.siteUrl,
    description: SEO_CONFIG.siteDescription,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SEO_CONFIG.siteUrl}/blog?search={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

/**
 * Generate Blog Schema
 */
export function generateBlogSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: SEO_CONFIG.blog.title,
    description: SEO_CONFIG.blog.description,
    url: `${SEO_CONFIG.siteUrl}/blog`,
    publisher: {
      '@type': 'Organization',
      name: SEO_CONFIG.organization.name,
      logo: {
        '@type': 'ImageObject',
        url: SEO_CONFIG.organization.logo,
      },
    },
  };
}

/**
 * Generate Article Schema for blog posts
 */
export function generateArticleSchema(post: BlogPost) {
  const absoluteUrl = `${SEO_CONFIG.siteUrl}/blog/${post.slug}`;

  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.seo.description,
    image: post.featuredImage?.url || SEO_CONFIG.ogImage,
    datePublished: post.publishedDate,
    dateModified: post.modifiedDate,
    author: {
      '@type': 'Person',
      name: post.author.name,
      url: SEO_CONFIG.defaultAuthor.url,
    },
    publisher: {
      '@type': 'Organization',
      name: SEO_CONFIG.organization.name,
      logo: {
        '@type': 'ImageObject',
        url: SEO_CONFIG.organization.logo,
      },
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': absoluteUrl,
    },
    keywords: post.tags.map((tag) => tag.name).join(', '),
    articleSection: post.categories.map((cat) => cat.name).join(', '),
  };
}

/**
 * Generate BreadcrumbList Schema
 */
export function generateBreadcrumbSchema(items: Array<{ name: string; url: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: `${SEO_CONFIG.siteUrl}${item.url}`,
    })),
  };
}

/**
 * Generate BlogPosting Schema with enhanced metadata
 */
export function generateBlogPostingSchema(post: BlogPost) {
  const absoluteUrl = `${SEO_CONFIG.siteUrl}/blog/${post.slug}`;
  const wordCount = post.content.split(/\s+/).length;
  const readingTime = Math.ceil(wordCount / 200); // 200 words per minute

  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    alternativeHeadline: post.seo.ogTitle || post.title,
    description: post.seo.description,
    image: {
      '@type': 'ImageObject',
      url: post.featuredImage?.url || SEO_CONFIG.ogImage,
      width: post.featuredImage?.width || SEO_CONFIG.ogImageWidth,
      height: post.featuredImage?.height || SEO_CONFIG.ogImageHeight,
    },
    datePublished: post.publishedDate,
    dateModified: post.modifiedDate,
    author: {
      '@type': 'Person',
      name: post.author.name,
      image: post.author.avatar,
      description: post.author.bio,
    },
    publisher: {
      '@type': 'Organization',
      name: SEO_CONFIG.organization.name,
      logo: {
        '@type': 'ImageObject',
        url: SEO_CONFIG.organization.logo,
      },
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': absoluteUrl,
    },
    url: absoluteUrl,
    keywords: post.tags.map((tag) => tag.name).join(', '),
    articleSection: post.categories.map((cat) => cat.name),
    wordCount: wordCount,
    timeRequired: `PT${readingTime}M`,
    inLanguage: 'en-US',
  };
}

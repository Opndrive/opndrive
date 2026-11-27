/**
 * Structured Data (JSON-LD) Generators
 * Generate schema.org structured data for better SEO
 */

import { SEO_CONFIG } from './config';
import type { BlogAuthor, BlogPost, BlogPostSummary } from '@/lib/wordpress/types';
import { authorPath, hubPath } from '@/lib/wordpress/seo-text';
import { coverImageFor, type CoverImage } from '@/lib/blog-cover/cover-url';
import { countWords } from '@/lib/wordpress/utils';

/**
 * Generate Organization Schema
 */
export function generateOrganizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': ORGANIZATION_ID,
    name: SEO_CONFIG.organization.name,
    url: SEO_CONFIG.organization.url,
    logo: SEO_CONFIG.organization.logo,
    sameAs: SEO_CONFIG.organization.sameAs,
  };
}

/**
 * Generate WebSite Schema
 *
 * The name Google should use for the site, set on the home page as its site
 * names documentation asks. Name and URL only: there is no alternateName
 * because the site goes by "Opndrive" and nothing else.
 *
 * It used to carry a SearchAction for the sitelinks search box. Google retired
 * that feature in November 2024, and the URL it advertised (/blog?search=)
 * never existed, so it is gone.
 */
export function generateWebSiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SEO_CONFIG.siteName,
    url: `${SEO_CONFIG.siteUrl}/`,
  };
}

/** The blog as one entity that every post is part of. */
const BLOG_ID = `${SEO_CONFIG.siteUrl}/blog#blog`;

/** One identifier for Opndrive, so every mention of it is the same entity. */
export const ORGANIZATION_ID = `${SEO_CONFIG.siteUrl}/#organization`;

const PUBLISHER = {
  '@type': 'Organization',
  '@id': ORGANIZATION_ID,
  name: SEO_CONFIG.organization.name,
  url: SEO_CONFIG.organization.url,
  logo: {
    '@type': 'ImageObject',
    url: SEO_CONFIG.organization.logo,
  },
} as const;

/** A post's absolute address. */
function postUrl(slug: string): string {
  return `${SEO_CONFIG.siteUrl}/blog/${slug}`;
}

/** A path or address as an absolute URL, as structured data wants. */
function absolute(url: string): string {
  return url.startsWith('/') ? `${SEO_CONFIG.siteUrl}${url}` : url;
}

/**
 * Who wrote a post: a Person, with their profile page on this blog, their
 * bio and their own pages elsewhere, all from their WordPress profile. The
 * organisation is the publisher, not the author.
 */
function authorPersonEntity(author: BlogAuthor) {
  return {
    '@type': 'Person',
    name: author.name,
    ...(author.slug ? { url: absolute(authorPath(author.slug)) } : {}),
    ...(author.bio ? { description: author.bio } : {}),
    ...(author.sameAs.length ? { sameAs: author.sameAs } : {}),
  };
}

/**
 * Whether a post's author is Opndrive itself: the WordPress account the posts
 * are published under, which is the organisation, not a person.
 */
export function isOrganizationAuthor(author: Pick<BlogAuthor, 'name'>): boolean {
  return author.name.trim().toLowerCase() === SEO_CONFIG.organization.name.toLowerCase();
}

/**
 * Who wrote a post, for BlogPosting's `author`.
 *
 * Posts by the Opndrive account are by the organisation: the same entity as
 * the publisher (one `@id`), linked to its home page, as Google's article
 * guidelines ask of an organisation author. A post by a person names them as a
 * Person, with their profile page here, their bio and their own pages.
 */
export function postAuthorEntity(author: BlogAuthor) {
  return isOrganizationAuthor(author) ? PUBLISHER : authorPersonEntity(author);
}

/**
 * An author's profile page, and the posts it lists.
 *
 * Google reads ProfilePage for a page whose main focus is one person or
 * organisation affiliated with the site; `mainEntity` may be either, and
 * needs a `name`, with `description`, `image` and `sameAs` recommended. For
 * Opndrive it is the organisation, the same `@id` the posts name as author
 * and publisher, with the bio from its WordPress profile.
 */
export function generateProfilePageSchema(
  author: BlogAuthor & { slug: string },
  posts: ReadonlyArray<Pick<BlogPostSummary, 'slug' | 'title' | 'publishedDate'>>
) {
  const url = absolute(authorPath(author.slug));
  const mainEntity = isOrganizationAuthor(author)
    ? {
        ...PUBLISHER,
        image: SEO_CONFIG.organization.logo,
        ...(author.bio ? { description: author.bio } : {}),
        sameAs: Array.from(new Set([...SEO_CONFIG.organization.sameAs, ...author.sameAs])),
      }
    : { ...authorPersonEntity(author), '@id': `${url}#person` };

  return {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    '@id': `${url}#profile`,
    url,
    mainEntity,
    hasPart: posts.map((post) => ({
      '@type': 'BlogPosting',
      headline: post.title,
      url: postUrl(post.slug),
      datePublished: post.publishedDate,
    })),
  };
}

/** A topic's hub: a collection of the posts it lists, part of the blog. */
export function generateCollectionPageSchema(
  hub: { name: string; slug: string; description: string },
  posts: ReadonlyArray<Pick<BlogPostSummary, 'slug' | 'title'>>
) {
  const url = absolute(hubPath(hub.slug));
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${url}#hub`,
    url,
    name: hub.name,
    ...(hub.description ? { description: hub.description } : {}),
    isPartOf: { '@id': BLOG_ID },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: posts.map((post, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: postUrl(post.slug),
        name: post.title,
      })),
    },
  };
}

/**
 * The blog, with the posts its index page shows. Listing them ties each post
 * to the blog for search engines the same way the page's links do for readers.
 */
export function generateBlogSchema(
  posts: ReadonlyArray<
    Pick<BlogPostSummary, 'slug' | 'title' | 'publishedDate' | 'modifiedDate' | 'featuredImage'>
  > = []
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    '@id': BLOG_ID,
    name: SEO_CONFIG.blog.title,
    description: SEO_CONFIG.blog.description,
    url: `${SEO_CONFIG.siteUrl}/blog`,
    inLanguage: 'en-US',
    publisher: PUBLISHER,
    ...(posts.length
      ? {
          blogPost: posts.map((post) => ({
            '@type': 'BlogPosting',
            headline: post.title,
            url: postUrl(post.slug),
            datePublished: post.publishedDate,
            dateModified: post.modifiedDate,
            image: absolute(coverImageFor(post).url),
          })),
        }
      : {}),
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
 * A post, as one BlogPosting. (It used to be described twice, as an Article
 * and as a BlogPosting, with the Article's author linking to an /about page
 * that does not exist.)
 */
export function generateBlogPostingSchema(post: BlogPost, cover: CoverImage) {
  const url = postUrl(post.slug);
  // Words of the text, not of the HTML around it.
  const wordCount = countWords(post.content);

  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    '@id': `${url}#post`,
    headline: post.title,
    description: post.seo.description,
    image: {
      '@type': 'ImageObject',
      url: absolute(cover.url),
      width: cover.width,
      height: cover.height,
    },
    datePublished: post.publishedDate,
    dateModified: post.modifiedDate,
    author: postAuthorEntity(post.author),
    publisher: PUBLISHER,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': url,
    },
    isPartOf: { '@id': BLOG_ID },
    url,
    ...(post.tags.length ? { keywords: post.tags.map((tag) => tag.name).join(', ') } : {}),
    ...(post.categories.length
      ? { articleSection: post.categories.map((category) => category.name) }
      : {}),
    wordCount,
    timeRequired: `PT${Math.max(1, Math.ceil(wordCount / 200))}M`,
    inLanguage: 'en-US',
  };
}

/**
 * The questions a post answers in its own FAQ section, as an FAQPage.
 *
 * Only what the page shows: the questions and answers are read from the
 * post's FAQ section (lib/blog-content/outline). Google shows FAQ results for
 * few sites these days, but the markup is still read, by Google and by other
 * search and answer engines, as a plain statement of what the page answers.
 */
export function generateFaqPageSchema(
  slug: string,
  faq: ReadonlyArray<{ question: string; answer: string }>,
  /** The FAQ heading's id on the page, so the address points at it. */
  sectionId: string | null
) {
  const url = sectionId ? `${postUrl(slug)}#${sectionId}` : postUrl(slug);
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    '@id': sectionId ? url : `${url}#faq`,
    url,
    mainEntity: faq.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  };
}

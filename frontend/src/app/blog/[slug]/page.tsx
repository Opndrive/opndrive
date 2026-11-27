import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPostBySlug, getRelatedPosts } from '@/lib/wordpress/service';
import { isWordPressConfigured } from '@/lib/wordpress/client';
import { getRenderedPostContent } from '@/lib/blog-content/render';
import { coverImageFor } from '@/lib/blog-cover/cover-url';
import { StructuredData } from '@/components/seo';
import { BlogPostArticle } from '@/components/blog/blog-post-article';
import { authorPath, hubFor, hubPath } from '@/lib/wordpress/seo-text';
import {
  generateBlogPostingSchema,
  generateBreadcrumbSchema,
  generateFaqPageSchema,
  getAbsoluteUrl,
  generateKeywords,
} from '@/lib/seo';
import { isBlogEnabled } from '@/config/features';

/*
 * Deliberately no `generateStaticParams` and no `revalidate` here.
 *
 * Both used to be exported, asking Next.js to pre-render the posts and treat
 * any other slug as an incremental static page built on first request. That
 * cannot work in this app: the root layout reads headers() for the CSP nonce,
 * so no page can be static. With posts to pre-render, the build found that out
 * and quietly made the route dynamic. With none, it never tried, registered
 * the route as incremental static, and every request then failed with a 500
 * (DYNAMIC_SERVER_USAGE) before this page's own notFound() could answer -
 * /blog/rss.xml included, which had no route of its own and landed here.
 *
 * Rendered per request instead, the WordPress responses are still cached:
 * the client asks fetch for force-cache with a 60 second revalidate.
 */

/** A cover's address as an absolute URL, as share images need. */
function getAbsoluteUrlOf(url: string): string {
  return url.startsWith('/') ? getAbsoluteUrl(url) : url;
}

// Generate metadata for each post
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  // Early return if blog is disabled
  if (!isBlogEnabled()) {
    return {
      title: 'Blog Not Available',
    };
  }

  const { slug } = await params;

  // No WordPress behind the blog: no post can exist, which is known.
  if (!isWordPressConfigured()) {
    return { title: 'Post Not Found' };
  }

  // A WordPress error is thrown on, not turned into "not found": the page then
  // answers 500, which a crawler retries, instead of a 404 for a live post.
  const post = await getPostBySlug(slug);

  if (!post) {
    return {
      title: 'Post Not Found',
    };
  }

  // Yoast's search title and description, whole: <title>, Open Graph and
  // Twitter all say the same thing. See transformPost for the fallbacks.
  const { title, description } = post.seo;

  // Generate comprehensive keywords
  const keywords = generateKeywords(
    post.tags.map((t) => t.name),
    post.categories.map((c) => c.name),
    ['cloud storage', 'file management', 's3 storage', 'tutorial', 'guide']
  );

  // Absolute URLs for Open Graph
  const absoluteUrl = getAbsoluteUrl(`/blog/${post.slug}`);
  // The author's share image or cover, and otherwise the cover drawn from the
  // title: every post has one now, where a post without a cover used to be
  // shared as a bare link.
  const cover = coverImageFor(post);
  // seo.ogImage is the featured image itself unless an SEO plugin set one of
  // its own. Only that separate image has no known size; the cover's own
  // width, height and description are used otherwise.
  const separateShareImage =
    post.seo.ogImage && post.seo.ogImage !== post.featuredImage?.url ? post.seo.ogImage : null;
  const shareImage = separateShareImage
    ? { url: separateShareImage, alt: post.title }
    : {
        url: getAbsoluteUrlOf(cover.url),
        width: cover.width,
        height: cover.height,
        alt: cover.alt,
      };

  return {
    title,
    description,
    keywords: keywords,
    authors: [
      {
        name: post.author.name,
        url: getAbsoluteUrl(post.author.slug ? authorPath(post.author.slug) : '/blog'),
      },
    ],
    creator: post.author.name,
    publisher: 'Opndrive',

    // Open Graph
    openGraph: {
      title,
      description,
      type: 'article',
      publishedTime: post.publishedDate,
      modifiedTime: post.modifiedDate,
      authors: [post.author.name],
      tags: post.tags.map((tag) => tag.name),
      section: post.categories[0]?.name,
      url: absoluteUrl,
      siteName: 'Opndrive',
      locale: 'en_US',
      // No `type`: covers are PNG as often as JPEG, and a wrong one is worse
      // than none.
      images: [shareImage],
    },

    // Twitter Card
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [shareImage.url],
      creator: '@opndrive',
      site: '@opndrive',
    },

    // Canonical URL, and the blog's feed for readers who land on a post.
    // Always the post's own address here: Yoast's canonical is the address
    // on the WordPress server, and is not asked for.
    alternates: {
      canonical: absoluteUrl,
      types: {
        'application/rss+xml': [
          { url: getAbsoluteUrl('/blog/rss.xml'), title: 'Opndrive Blog RSS Feed' },
        ],
      },
    },

    // Robots meta
    robots: {
      index: !post.seo.noindex,
      follow: !post.seo.nofollow,
      googleBot: {
        index: !post.seo.noindex,
        follow: !post.seo.nofollow,
        'max-video-preview': -1,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },

    // Additional metadata
    category: post.categories[0]?.name,

    // Verification and other meta tags
    other: {
      'article:published_time': post.publishedDate,
      'article:modified_time': post.modifiedDate,
      'article:author': post.author.name,
      'article:section': post.categories[0]?.name || 'Blog',
      'article:tag': post.tags.map((tag) => tag.name).join(', '),
    },
  };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  // Early return if blog is disabled - let layout handle 404
  if (!isBlogEnabled()) {
    return null;
  }

  const { slug } = await params;

  // No WordPress behind the blog: no post can exist, so a 404 is the truth.
  if (!isWordPressConfigured()) {
    notFound();
  }

  // Only a post WordPress says does not exist is a 404. A failed request is
  // thrown on and answers 500: a 404 would tell Google a live post was gone.
  const post = await getPostBySlug(slug);

  if (!post) {
    notFound();
  }

  // Related posts and the rendered body do not depend on each other, so
  // neither waits for the other. A failure to find related posts costs the
  // page that section, not the post.
  const [relatedPosts, content] = await Promise.all([
    getRelatedPosts(post, 3).catch((error: unknown) => {
      console.error('Error fetching related posts:', error);
      return [];
    }),
    // Highlighted and framed on the server; remembered per post version.
    getRenderedPostContent(post),
  ]);

  // Generate structured data for SEO
  const cover = coverImageFor(post);
  const hub = hubFor(post.categories);
  const structuredData: Array<Record<string, unknown>> = [
    generateBlogPostingSchema(post, cover),
    generateBreadcrumbSchema([
      { name: 'Home', url: '/' },
      { name: 'Blog', url: '/blog' },
      // The post's topic, once that topic has a hub page of its own.
      ...(hub ? [{ name: hub.name, url: hubPath(hub.slug) }] : []),
      { name: post.title, url: `/blog/${post.slug}` },
    ]),
    // The questions the post's own FAQ section answers, as it shows them.
    ...(content.faq.length ? [generateFaqPageSchema(post.slug, content.faq, content.faqId)] : []),
  ];

  return (
    <>
      <StructuredData data={structuredData} />
      <BlogPostArticle post={post} content={content} relatedPosts={relatedPosts} />
    </>
  );
}

import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getPostBySlug, getRelatedPosts } from '@/lib/wordpress/service';
import { isWordPressConfigured } from '@/lib/wordpress/client';
import { formatDate, getReadingTime, wasUpdatedAfterPublishing } from '@/lib/wordpress/utils';
import { getRenderedPostContent } from '@/lib/blog-content/render';
import { BlogPostContent } from '@/components/blog/blog-post-content';
import { RelevantBlogPosts } from '@/components/blog/relevant-blog-posts';
import { BlogDiscordLink } from '@/components/blog/blog-discord-link';
import BlogNavbar from '@/components/blog/blog-navbar';
import { BlogCoverImage } from '@/components/blog/blog-cover-image';
import { coverImageFor } from '@/lib/blog-cover/cover-url';
import { TableOfContents } from '@/components/blog/table-of-contents';
import { ReadingAids } from '@/components/blog/reading-aids';
import { ShareButtons } from '@/components/blog/share-buttons';
import { TOC_MIN_SECTIONS } from '@/lib/blog-content/headings';
import FAQSection from '@/features/landing-page/components/faq-section';
import CTASection from '@/features/landing-page/components/cta-section';
import { StructuredData } from '@/components/seo';
import {
  generateBlogPostingSchema,
  generateBreadcrumbSchema,
  generateFaqPageSchema,
  getAbsoluteUrl,
  optimizeDescription,
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

  // Optimize description length for SEO
  const optimizedDescription = optimizeDescription(post.seo.description);

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
    title: post.seo.title,
    description: optimizedDescription,
    keywords: keywords,
    authors: [
      {
        name: post.author.name,
        url: getAbsoluteUrl('/blog'),
      },
    ],
    creator: post.author.name,
    publisher: 'Opndrive',

    // Open Graph
    openGraph: {
      title: post.seo.ogTitle || post.seo.title,
      description: post.seo.ogDescription || optimizedDescription,
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
      title: post.seo.ogTitle || post.seo.title,
      description: post.seo.ogDescription || optimizedDescription,
      images: [shareImage.url],
      creator: '@opndrive',
      site: '@opndrive',
    },

    // Canonical URL, and the blog's feed for readers who land on a post
    alternates: {
      canonical: post.seo.canonical || absoluteUrl,
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
  const structuredData: Array<Record<string, unknown>> = [
    generateBlogPostingSchema(post, cover),
    generateBreadcrumbSchema([
      { name: 'Home', url: '/' },
      { name: 'Blog', url: '/blog' },
      { name: post.title, url: `/blog/${post.slug}` },
    ]),
    // The questions the post's own FAQ section answers, as it shows them.
    ...(content.faq.length ? [generateFaqPageSchema(post.slug, content.faq, content.faqId)] : []),
  ];

  // Calculate reading time
  const readingTime = getReadingTime(post.content);

  // Said only when the change came on a later day than publishing.
  const updated = wasUpdatedAfterPublishing(post.publishedDateLocal, post.modifiedDateLocal);

  // A short post reads fine without a list of its sections.
  const showToc =
    content.headings.filter((heading) => heading.level === 2).length >= TOC_MIN_SECTIONS;

  return (
    <div className="min-h-screen bg-background">
      {/* Structured Data for SEO */}
      <StructuredData data={structuredData} />

      {/* Reading progress along the top, and back to top once well in */}
      <ReadingAids articleId="post-body" titleId="post-title" />

      {/* Navbar */}
      <BlogNavbar />

      {/* Static Header Spacer */}
      <div className="h-1"></div>

      {/* Article Container */}
      <article className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        {/* Where this post sits, matching the breadcrumb in the structured
            data, and the way back to the blog from any post */}
        <nav aria-label="Breadcrumb" className="mb-6 flex justify-center">
          <ol className="flex items-center gap-2 text-sm text-muted-foreground">
            <li>
              <Link href="/" className="hover:text-foreground hover:underline">
                Home
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link href="/blog" className="hover:text-foreground hover:underline">
                Blog
              </Link>
            </li>
          </ol>
        </nav>

        {/* Title */}
        <h1
          id="post-title"
          // Back to top moves focus here, so it needs to be able to take it.
          tabIndex={-1}
          // break-words: a title word longer than a small phone is wide
          // (SignatureDoesNotMatch, at this size) breaks instead of widening
          // the page.
          className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground text-center mb-6 leading-tight text-balance break-words"
        >
          {post.title}
        </h1>

        {/* Meta Info. Wraps on a narrow screen rather than running off it. */}
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-muted-foreground mb-8">
          <span>by {post.author.name}</span>
          <span aria-hidden="true">|</span>
          <time dateTime={post.publishedDate}>{formatDate(post.publishedDateLocal)}</time>
          {updated ? (
            <>
              <span aria-hidden="true">|</span>
              <span>
                Updated{' '}
                <time dateTime={post.modifiedDate}>{formatDate(post.modifiedDateLocal)}</time>
              </span>
            </>
          ) : null}
          <span aria-hidden="true">|</span>
          <span>{readingTime} min read</span>
        </div>

        {/* Featured Image: the author's cover, or the one drawn from the title */}
        <BlogCoverImage
          image={cover}
          shape="intrinsic"
          sizes="(max-width: 1024px) 100vw, 960px"
          priority
          className="rounded-2xl mb-12"
        />

        {/* On a narrow screen the sections are a closed panel above the post */}
        {showToc ? (
          <TableOfContents
            headings={content.headings}
            variant="collapsible"
            className="mb-10 lg:hidden"
          />
        ) : null}

        {/* Content Layout with Sticky Sidebar */}
        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-8">
          {/* Left Sidebar: the post's sections, then the call to action. The
              column never grows past the window; a long list of sections
              scrolls inside it instead of pushing the call to action off. */}
          <aside className="hidden lg:block">
            <div className="sticky top-8 flex max-h-[calc(100vh-4rem)] flex-col gap-6">
              {showToc ? <TableOfContents headings={content.headings} variant="sidebar" /> : null}

              <div className="shrink-0 bg-card border border-border rounded-2xl p-5 shadow-sm">
                <div className="space-y-3">
                  {/* Not a heading: it would sit between the title and the
                      post's first section in a screen reader's outline. */}
                  <p className="text-base font-bold text-foreground text-center">
                    Ready to manage your S3 storage?
                  </p>

                  <p className="text-sm text-muted-foreground text-center leading-relaxed">
                    Open-source modern UI for S3 Compatible Storage Services with full control over
                    your data.
                  </p>

                  <Link
                    href="/connect"
                    className="block w-full bg-primary hover:bg-primary/90 text-primary-foreground text-center font-semibold py-2.5 px-6 rounded-xl transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    Get Started
                  </Link>
                </div>
              </div>
            </div>
          </aside>

          {/* Right Content */}
          <div className="min-w-0 ">
            {/* Post Content */}
            <BlogPostContent html={content.html} />

            {/* After the last line: pass it on, and keep up */}
            <footer className="mt-14 grid gap-8 border-t border-border pt-8 sm:grid-cols-[1fr_auto]">
              <div>
                <p className="mb-4 text-sm font-semibold text-foreground">Share this post</p>
                <ShareButtons url={getAbsoluteUrl(`/blog/${post.slug}`)} title={post.title} />
              </div>
              <div>
                <p className="mb-4 text-sm font-semibold text-foreground">Join the community</p>
                <BlogDiscordLink />
              </div>
            </footer>
          </div>
        </div>
      </article>

      {/* Relevant Blog Posts Section */}
      <RelevantBlogPosts posts={relatedPosts} />

      {/* The product FAQ, for posts that do not end with an FAQ of their own:
          two FAQ sections one after the other read as a page repeating
          itself. */}
      {content.faq.length === 0 ? <FAQSection /> : null}

      {/* CTA Section */}
      <CTASection href="/connect" />
    </div>
  );
}

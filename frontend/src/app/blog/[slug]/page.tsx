import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getPostBySlug, getRelatedPosts } from '@/lib/wordpress/service';
import { isWordPressConfigured } from '@/lib/wordpress/client';
import { formatDate, getReadingTime } from '@/lib/wordpress/utils';
import { getRenderedPostContent } from '@/lib/blog-content/render';
import { BlogPostContent, RelevantBlogPosts } from '@/components/blog';
import BlogNavbar from '@/components/blog/blog-navbar';
import { BlogCoverImage } from '@/components/blog/blog-cover-image';
import FAQSection from '@/features/landing-page/components/faq-section';
import CTASection from '@/features/landing-page/components/cta-section';
import { StructuredData } from '@/components/seo';
import {
  generateArticleSchema,
  generateBlogPostingSchema,
  generateBreadcrumbSchema,
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
  const ogImageUrl = post.seo.ogImage || post.featuredImage?.url;

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
      images: ogImageUrl
        ? [
            {
              url: ogImageUrl,
              width: post.featuredImage?.width || 1200,
              height: post.featuredImage?.height || 630,
              alt: post.featuredImage?.alt || post.title,
              type: 'image/jpeg',
            },
          ]
        : [],
    },

    // Twitter Card
    twitter: {
      card: 'summary_large_image',
      title: post.seo.ogTitle || post.seo.title,
      description: post.seo.ogDescription || optimizedDescription,
      images: ogImageUrl ? [ogImageUrl] : [],
      creator: '@opndrive',
      site: '@opndrive',
    },

    // Canonical URL
    alternates: {
      canonical: post.seo.canonical || absoluteUrl,
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
  const articleSchema = generateArticleSchema(post);
  const blogPostingSchema = generateBlogPostingSchema(post);
  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: 'Home', url: '/' },
    { name: 'Blog', url: '/blog' },
    { name: post.title, url: `/blog/${post.slug}` },
  ]);

  // Calculate reading time
  const readingTime = getReadingTime(post.content);

  return (
    <div className="min-h-screen bg-background">
      {/* Structured Data for SEO */}
      <StructuredData data={[articleSchema, blogPostingSchema, breadcrumbSchema]} />

      {/* Navbar */}
      <BlogNavbar />

      {/* Static Header Spacer */}
      <div className="h-1"></div>

      {/* Article Container */}
      <article className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        {/* Title */}
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground text-center mb-6 leading-tight">
          {post.title}
        </h1>

        {/* Meta Info */}
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mb-8">
          <span>by {post.author.name}</span>
          <span>|</span>
          <time dateTime={post.publishedDate}>{formatDate(post.publishedDateLocal)}</time>
          <span>|</span>
          <span>{readingTime} min read</span>
        </div>

        {/* Featured Image */}
        {post.featuredImage ? (
          <BlogCoverImage
            image={post.featuredImage}
            shape="intrinsic"
            sizes="(max-width: 1024px) 100vw, 960px"
            priority
            className="rounded-2xl mb-12"
          />
        ) : null}

        {/* Content Layout with Sticky Sidebar */}
        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-8">
          {/* Left Sidebar - Sticky CTA */}
          <aside className="hidden lg:block">
            <div className="sticky top-20">
              <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
                <div className="space-y-4">
                  <h3 className="text-lg font-bold text-foreground text-center">
                    Ready to manage your S3 storage?
                  </h3>

                  <p className="text-sm text-muted-foreground text-center leading-relaxed">
                    Open-source modern UI for S3 Compatible Storage Services with full control over
                    your data.
                  </p>

                  <Link
                    href="/connect"
                    className="block w-full bg-primary hover:bg-primary/90 text-primary-foreground text-center font-semibold py-3 px-6 rounded-xl transition-colors"
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

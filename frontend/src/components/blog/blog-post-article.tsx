import Link from 'next/link';
import type { ReactNode } from 'react';
import type { BlogPost, BlogPostSummary } from '@/lib/wordpress/types';
import type { RenderedPostContent } from '@/lib/blog-content/render';
import { formatDate, getReadingTime, wasUpdatedAfterPublishing } from '@/lib/wordpress/utils';
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
import { getAbsoluteUrl } from '@/lib/seo';

/**
 * A post as readers see it: the published page and the editors' preview both
 * render this, so a preview shows exactly what publishing will.
 */
export function BlogPostArticle({
  post,
  content,
  relatedPosts,
  previewNotice,
}: {
  post: BlogPost;
  content: RenderedPostContent;
  relatedPosts: BlogPostSummary[];
  /**
   * The editors' preview: shown under the navbar, and it also hides what only
   * makes sense for a published post (sharing its address, related posts).
   */
  previewNotice?: ReactNode;
}) {
  const isPreview = previewNotice !== undefined;
  const cover = coverImageFor(post);

  // Calculate reading time
  const readingTime = getReadingTime(post.content);

  // Said only when the change came on a later day than publishing.
  const updated = wasUpdatedAfterPublishing(post.publishedDateLocal, post.modifiedDateLocal);

  // A short post reads fine without a list of its sections.
  const showToc =
    content.headings.filter((heading) => heading.level === 2).length >= TOC_MIN_SECTIONS;

  return (
    <div className="min-h-screen bg-background">
      {/* Reading progress along the top, and back to top once well in */}
      <ReadingAids articleId="post-body" titleId="post-title" />

      {/* Navbar */}
      <BlogNavbar />

      {previewNotice}

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

                  {/* A plain link: the app loads as a new document, under its
                      own security policy (see page-profile.ts). */}
                  <a
                    href="/connect"
                    className="block w-full bg-primary hover:bg-primary/90 text-primary-foreground text-center font-semibold py-2.5 px-6 rounded-xl transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    Get Started
                  </a>
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
              {isPreview ? null : (
                <div>
                  <p className="mb-4 text-sm font-semibold text-foreground">Share this post</p>
                  <ShareButtons url={getAbsoluteUrl(`/blog/${post.slug}`)} title={post.title} />
                </div>
              )}
              <div>
                <p className="mb-4 text-sm font-semibold text-foreground">Join the community</p>
                <BlogDiscordLink />
              </div>
            </footer>
          </div>
        </div>
      </article>

      {/* Relevant Blog Posts Section */}
      {isPreview ? null : <RelevantBlogPosts posts={relatedPosts} />}

      {/* The product FAQ, for posts that do not end with an FAQ of their own:
          two FAQ sections one after the other read as a page repeating
          itself. */}
      {content.faq.length === 0 ? <FAQSection /> : null}

      {/* CTA Section */}
      <CTASection href="/connect" />
    </div>
  );
}

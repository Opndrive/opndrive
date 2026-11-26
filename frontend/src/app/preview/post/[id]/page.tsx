import type { Metadata } from 'next';
import { draftMode } from 'next/headers';
import { notFound } from 'next/navigation';
import { isBlogEnabled } from '@/config/features';
import { BlogPostArticle } from '@/components/blog/blog-post-article';
import { renderPostContent, unrenderedContent } from '@/lib/blog-content/render';
import { isPreviewConfigured, isWordPressConfigured } from '@/lib/wordpress/client';
import { getPreviewPost } from '@/lib/wordpress/service';

/**
 * An unpublished post, rendered exactly as it will be once published, for
 * the editors who opened it from WordPress.
 *
 * Only reachable in draft mode, which only /api/preview turns on, after
 * checking a signed link. Everyone else gets a 404. Outside /blog on purpose:
 * it can never collide with a post's address, it is not in the sitemap, and
 * it is not one of the pages analytics may count. Never indexed, never cached.
 */

export const metadata: Metadata = {
  title: 'Draft preview - Opndrive',
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
};

function PreviewNotice() {
  return (
    <div
      role="status"
      className="border-b border-border bg-muted px-4 py-3 text-sm text-foreground sm:px-6"
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
        <p>
          <strong>Preview.</strong> This post is not published. Only this browser can see this page,
          and search engines are told not to index it.
        </p>
        <form action="/api/preview/exit" method="post">
          <button
            type="submit"
            className="rounded-md border border-border bg-background px-3 py-1.5 font-medium hover:bg-card"
          >
            Exit preview
          </button>
        </form>
      </div>
    </div>
  );
}

export default async function PreviewPostPage({ params }: { params: Promise<{ id: string }> }) {
  if (!isBlogEnabled() || !isWordPressConfigured() || !isPreviewConfigured()) notFound();
  if (!(await draftMode()).isEnabled) notFound();

  const { id } = await params;
  if (!/^[1-9]\d{0,15}$/.test(id)) notFound();

  const post = await getPreviewPost(Number(id));
  if (!post) notFound();

  // Not remembered like a published post's body: a draft changes between
  // previews, and must not be kept where a public request could find it.
  const content = await renderPostContent(post.content).catch(() =>
    unrenderedContent(post.content)
  );

  return (
    <BlogPostArticle
      post={post}
      content={content}
      relatedPosts={[]}
      previewNotice={<PreviewNotice />}
    />
  );
}

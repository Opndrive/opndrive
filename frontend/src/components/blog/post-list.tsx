import Link from 'next/link';
import type { BlogPostSummary } from '@/lib/wordpress/types';
import { formatDate } from '@/lib/wordpress/utils';

/**
 * Posts as a plain list, newest first: title, the description search results
 * show, and the date. For the author and topic pages, where the point is to
 * scan what is there, not to browse covers.
 */
export function PostList({ posts }: { posts: readonly BlogPostSummary[] }) {
  return (
    <ol className="divide-y divide-border">
      {posts.map((post) => (
        <li key={post.id} className="py-6 first:pt-0">
          <article>
            <h2 className="text-xl font-semibold leading-snug text-foreground">
              <Link href={`/blog/${post.slug}`} className="hover:underline">
                {post.title}
              </Link>
            </h2>
            {post.description ? (
              <p className="mt-2 text-muted-foreground leading-relaxed">{post.description}</p>
            ) : null}
            <time
              dateTime={post.publishedDate}
              className="mt-2 block text-sm text-muted-foreground"
            >
              {formatDate(post.publishedDateLocal)}
            </time>
          </article>
        </li>
      ))}
    </ol>
  );
}

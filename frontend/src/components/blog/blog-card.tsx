import Link from 'next/link';
import type { BlogPost } from '@/lib/wordpress/types';
import { formatDate } from '@/lib/wordpress';
import { BlogCoverImage } from './blog-cover-image';

interface BlogCardProps {
  post: BlogPost;
}

export function BlogCard({ post }: BlogCardProps) {
  return (
    <Link href={`/blog/${post.slug}`} className="group block h-full">
      <article className="h-full overflow-hidden rounded-2xl bg-card transition-all duration-300 hover:shadow-xl flex flex-col">
        {/* Featured Image */}
        <BlogCoverImage
          image={post.featuredImage}
          sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
          zoomOnHover
        />

        <div className="p-4 sm:p-4 flex-1 flex flex-col">
          {/* Title */}
          <h2 className="text-lg sm:text-xl font-bold text-foreground mb-3 line-clamp-2 leading-tight">
            {post.title}
          </h2>

          {/* Date */}
          <time dateTime={post.publishedDate} className="text-sm text-muted-foreground mb-4">
            {formatDate(post.publishedDateLocal)}
          </time>

          {/* Excerpt */}
          <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3 flex-1">
            {post.excerpt}
          </p>
        </div>
      </article>
    </Link>
  );
}

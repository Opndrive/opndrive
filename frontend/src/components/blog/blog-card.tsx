import Link from 'next/link';
import Image from 'next/image';
import type { BlogPost } from '@/lib/wordpress/types';
import { formatDate } from '@/lib/wordpress';

interface BlogCardProps {
  post: BlogPost;
}

export function BlogCard({ post }: BlogCardProps) {
  // Strip HTML tags from excerpt
  const cleanExcerpt = post.excerpt.replace(/<[^>]*>/g, '');

  return (
    <Link href={`/blog/${post.slug}`} className="group block h-full">
      <article className="h-full overflow-hidden rounded-2xl bg-card transition-all duration-300 hover:shadow-xl flex flex-col">
        {/* Featured Image */}
        <div className="relative h-48 sm:h-56 w-full overflow-hidden bg-muted">
          {post.featuredImage ? (
            <Image
              src={post.featuredImage.url}
              alt={post.featuredImage.alt}
              fill
              className="object-cover transition-transform duration-500 group-hover:scale-105"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
              <div className="text-center space-y-2">
                <div className="text-4xl">Opndrive</div>
                <p className="text-sm font-medium text-muted-foreground">Blog Image</p>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 sm:p-4 flex-1 flex flex-col">
          {/* Title */}
          <h2 className="text-lg sm:text-xl font-bold text-foreground mb-3 line-clamp-2 leading-tight">
            {post.title}
          </h2>

          {/* Date */}
          <time dateTime={post.publishedDate} className="text-sm text-muted-foreground mb-4">
            {formatDate(post.publishedDate)}
          </time>

          {/* Excerpt */}
          <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3 flex-1">
            {cleanExcerpt}
          </p>
        </div>
      </article>
    </Link>
  );
}

'use client';

import Link from 'next/link';
import type { BlogPost } from '@/lib/wordpress/types';
import { formatDate } from '@/lib/wordpress';
import { BlogCoverImage } from './blog-cover-image';

interface FeaturedBlogPostProps {
  post: BlogPost;
}

export function FeaturedBlogPost({ post }: FeaturedBlogPostProps) {
  return (
    <Link href={`/blog/${post.slug}`} className="group block">
      <article className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 overflow-hidden transition-all duration-300">
        {/* Featured Image */}
        <BlogCoverImage
          image={post.featuredImage}
          shape="intrinsic"
          sizes="(max-width: 1024px) 100vw, 480px"
          priority
          zoomOnHover
          className="rounded-2xl self-center"
        />

        {/* Content */}
        <div className="flex flex-col justify-center">
          <div className="space-y-3 lg:space-y-2">
            {/* Date */}
            <time
              dateTime={post.publishedDate}
              className="text-sm font-medium text-muted-foreground"
            >
              {formatDate(post.publishedDateLocal)}
            </time>

            {/* Title */}
            <h3 className="text-2xl lg:text-2xl font-bold text-foreground leading-tight line-clamp-2">
              {post.title}
            </h3>

            {/* Excerpt */}
            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed line-clamp-4 lg:line-clamp-5">
              {post.excerpt}
            </p>
          </div>
        </div>
      </article>
    </Link>
  );
}

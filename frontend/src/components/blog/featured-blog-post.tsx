'use client';

import Link from 'next/link';
import Image from 'next/image';
import type { BlogPost } from '@/lib/wordpress/types';
import { formatDate } from '@/lib/wordpress';

interface FeaturedBlogPostProps {
  post: BlogPost;
}

export function FeaturedBlogPost({ post }: FeaturedBlogPostProps) {
  const cleanExcerpt = post.excerpt.replace(/<[^>]*>/g, '');

  return (
    <Link href={`/blog/${post.slug}`} className="group block">
      <article className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 overflow-hidden transition-all duration-300">
        {/* Featured Image */}
        <div className="relative rounded-2xl h-56 sm:h-64 lg:h-72 w-full overflow-hidden bg-muted">
          {post.featuredImage ? (
            <Image
              src={post.featuredImage.url}
              alt={post.featuredImage.alt}
              fill
              className="object-cover transition-transform duration-500 group-hover:scale-105"
              sizes="(max-width: 1024px) 100vw, 50vw"
              priority
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

        {/* Content */}
        <div className="flex flex-col justify-center">
          <div className="space-y-3 lg:space-y-2">
            {/* Date */}
            <time
              dateTime={post.publishedDate}
              className="text-sm font-medium text-muted-foreground"
            >
              {formatDate(post.publishedDate)}
            </time>

            {/* Title */}
            <h3 className="text-2xl lg:text-2xl font-bold text-foreground leading-tight line-clamp-2">
              {post.title}
            </h3>

            {/* Excerpt */}
            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed line-clamp-4 lg:line-clamp-5">
              {cleanExcerpt}
            </p>
          </div>
        </div>
      </article>
    </Link>
  );
}

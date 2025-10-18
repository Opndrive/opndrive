'use client';

import Link from 'next/link';
import { BlogPost } from '@/lib/wordpress/types';
import { BlogCard } from './blog-card';
import { ChevronRight } from 'lucide-react';

interface RelevantBlogPostsProps {
  posts: BlogPost[];
}

export function RelevantBlogPosts({ posts }: RelevantBlogPostsProps) {
  if (!posts || posts.length === 0) {
    return null;
  }

  return (
    <section className="bg-background py-12 sm:py-14 lg:py-16">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-10 text-center">
          Relevant blog posts
        </h2>

        {/* Blog Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {posts.map((post) => (
            <BlogCard key={post.id} post={post} />
          ))}
        </div>

        {/* See All Posts Button */}
        <div className="flex justify-center mt-10">
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-white font-medium px-6 py-3 rounded-full transition-colors"
          >
            See all posts
            <ChevronRight size={16} />
          </Link>
        </div>
      </div>
    </section>
  );
}

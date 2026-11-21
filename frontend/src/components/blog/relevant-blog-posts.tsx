import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import type { BlogPostSummary } from '@/lib/wordpress/types';
import { BlogCard } from './blog-card';

interface RelevantBlogPostsProps {
  posts: BlogPostSummary[];
}

export function RelevantBlogPosts({ posts }: RelevantBlogPostsProps) {
  if (!posts || posts.length === 0) {
    return null;
  }

  return (
    <section className="bg-background py-12 sm:py-14 lg:py-16">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header. Theme colours: this was text-white, which vanished
            on the light theme's white page. */}
        <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-foreground mb-10 text-center">
          Relevant blog posts
        </h2>

        {/* Blog Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {posts.map((post) => (
            <BlogCard key={post.id} post={post} />
          ))}
        </div>

        {/* See All Posts Button. primary-foreground, not white: the dark
            theme's primary is a light blue that white text barely shows on. */}
        <div className="flex justify-center mt-10">
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-medium px-6 py-3 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            See all posts
            <ChevronRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}

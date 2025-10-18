'use client';

interface BlogPostContentProps {
  content: string;
}

export function BlogPostContent({ content }: BlogPostContentProps) {
  return (
    <article className="custom-scrollbar prose prose-lg max-w-none dark:prose-invert">
      <div dangerouslySetInnerHTML={{ __html: content }} />
    </article>
  );
}

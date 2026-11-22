import { PostContentListener } from './post-content-listener';

interface BlogPostContentProps {
  /** The post body after renderPostContent: highlighted, framed code and all. */
  html: string;
}

export function BlogPostContent({ html }: BlogPostContentProps) {
  return (
    <PostContentListener>
      <article
        id="post-body"
        className="custom-scrollbar prose prose-lg max-w-none dark:prose-invert"
      >
        <div dangerouslySetInnerHTML={{ __html: html }} />
      </article>
    </PostContentListener>
  );
}

import { addCodeBlockToolbars } from '@/lib/wordpress/code-blocks';
import { CodeCopyListener } from './code-copy-listener';

interface BlogPostContentProps {
  content: string;
}

export function BlogPostContent({ content }: BlogPostContentProps) {
  return (
    <CodeCopyListener>
      <article className="custom-scrollbar prose prose-lg max-w-none dark:prose-invert">
        <div dangerouslySetInnerHTML={{ __html: addCodeBlockToolbars(content) }} />
      </article>
    </CodeCopyListener>
  );
}

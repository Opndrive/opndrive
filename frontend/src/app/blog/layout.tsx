import { notFound } from 'next/navigation';
import { isBlogEnabled } from '@/config/features';

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  // Redirect to 404 if blog is disabled
  if (!isBlogEnabled()) {
    notFound();
  }

  return <>{children}</>;
}

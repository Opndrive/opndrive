import { notFound } from 'next/navigation';
import { isBlogEnabled } from '@/config/features';
import { PublicAnalytics } from '@/components/analytics/public-analytics';
import { GitHubStarsProvider } from '@/hooks/use-github-stars';
import { getRepositoryStars } from '@/services/github-stars';

export default async function BlogLayout({ children }: { children: React.ReactNode }) {
  // Redirect to 404 if blog is disabled
  if (!isBlogEnabled()) {
    notFound();
  }

  const stars = await getRepositoryStars();

  return (
    <GitHubStarsProvider stars={stars}>
      {children}
      <PublicAnalytics />
    </GitHubStarsProvider>
  );
}

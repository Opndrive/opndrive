import { useState, useEffect } from 'react';
import { githubService } from '@/services/github-service';

interface UseGitHubStarsOptions {
  owner: string;
  repo: string;
  enabled?: boolean; // Allow disabling the hook
  refetchOnWindowFocus?: boolean;
}

interface UseGitHubStarsReturn {
  stars: number | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Custom hook to fetch and manage GitHub repository star count
 * @param options - Configuration options
 * @returns Object containing stars count, loading state, error, and refetch function
 */
export function useGitHubStars({
  owner,
  repo,
  enabled = true,
  refetchOnWindowFocus = false,
}: UseGitHubStarsOptions): UseGitHubStarsReturn {
  const [stars, setStars] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(enabled);
  const [error, setError] = useState<string | null>(null);

  const fetchStars = async () => {
    if (!enabled) return;

    try {
      setIsLoading(true);
      setError(null);

      const starCount = await githubService.fetchStarCount(owner, repo);
      setStars(starCount);

      if (starCount === null) {
        setError('Failed to fetch star count');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      console.error('Error fetching GitHub stars:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchStars();
  }, [owner, repo, enabled]);

  // Optional refetch on window focus
  useEffect(() => {
    if (!refetchOnWindowFocus || !enabled) return;

    const handleFocus = () => {
      fetchStars();
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [refetchOnWindowFocus, enabled, owner, repo]);

  return {
    stars,
    isLoading,
    error,
    refetch: fetchStars,
  };
}

/**
 * Simplified hook for Opndrive repository specifically
 * @param options - Optional configuration
 * @returns UseGitHubStarsReturn
 */
export function useOpndriveStars(
  options: Omit<UseGitHubStarsOptions, 'owner' | 'repo'> = {}
): UseGitHubStarsReturn {
  return useGitHubStars({
    owner: 'opndrive',
    repo: 'opndrive',
    ...options,
  });
}

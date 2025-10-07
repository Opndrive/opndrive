interface GitHubRepoData {
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  watchers_count: number;
}

interface GitHubApiResponse {
  stars: number;
  forks: number;
  issues: number;
  watchers: number;
}

class GitHubService {
  private static instance: GitHubService;
  private cache: Map<string, { data: GitHubApiResponse; timestamp: number }> = new Map();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  private readonly API_BASE = 'https://api.github.com';

  private constructor() {}

  static getInstance(): GitHubService {
    if (!GitHubService.instance) {
      GitHubService.instance = new GitHubService();
    }
    return GitHubService.instance;
  }

  /**
   * Fetch repository data from GitHub API with caching
   * @param owner - Repository owner (e.g., 'opndrive')
   * @param repo - Repository name (e.g., 'opndrive')
   * @returns Promise<GitHubApiResponse | null>
   */
  async fetchRepoData(owner: string, repo: string): Promise<GitHubApiResponse | null> {
    const cacheKey = `${owner}/${repo}`;
    const now = Date.now();

    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached && now - cached.timestamp < this.CACHE_DURATION) {
      return cached.data;
    }

    try {
      const response = await fetch(`${this.API_BASE}/repos/${owner}/${repo}`, {
        headers: {
          Accept: 'application/vnd.github.v3+json',
        },
      });

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
      }

      const data: GitHubRepoData = await response.json();

      const result: GitHubApiResponse = {
        stars: data.stargazers_count,
        forks: data.forks_count,
        issues: data.open_issues_count,
        watchers: data.watchers_count,
      };

      // Cache the result
      this.cache.set(cacheKey, { data: result, timestamp: now });

      return result;
    } catch (error) {
      console.error(`Failed to fetch GitHub repo data for ${owner}/${repo}:`, error);
      return null;
    }
  }

  /**
   * Fetch only star count for a repository
   * @param owner - Repository owner
   * @param repo - Repository name
   * @returns Promise<number | null>
   */
  async fetchStarCount(owner: string, repo: string): Promise<number | null> {
    const data = await this.fetchRepoData(owner, repo);
    return data?.stars ?? null;
  }

  /**
   * Clear cache (useful for testing or manual refresh)
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache status for debugging
   */
  getCacheInfo(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}

export const githubService = GitHubService.getInstance();
export default githubService;

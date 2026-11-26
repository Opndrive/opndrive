/**
 * The repository's star count, fetched by the server.
 *
 * It used to be fetched by the reader's browser, so every visit to the home
 * page or the blog told GitHub the visitor's address. Asked here instead, once
 * an hour for everyone, readers' browsers contact nobody but this site, and
 * the count stays well inside GitHub's sixty requests an hour for an
 * unauthenticated caller.
 *
 * Null when GitHub does not answer in time or answers with something else;
 * the pages then show the GitHub link without a number.
 */
const REPOSITORY_API_URL = 'https://api.github.com/repos/opndrive/opndrive';

const REFRESH_SECONDS = 60 * 60;

const TIMEOUT_MS = 3000;

export async function getRepositoryStars(): Promise<number | null> {
  try {
    const response = await fetch(REPOSITORY_API_URL, {
      headers: { Accept: 'application/vnd.github+json' },
      next: { revalidate: REFRESH_SECONDS },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return null;

    const data: unknown = await response.json();
    const stars = (data as { stargazers_count?: unknown } | null)?.stargazers_count;
    return typeof stars === 'number' && Number.isFinite(stars) ? stars : null;
  } catch {
    return null;
  }
}

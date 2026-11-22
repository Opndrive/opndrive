import { DOCS_URL, SITE_URL } from '@/config/links';
import { LICENSE_NAME, REPOSITORY_URL } from '@/config/legal';
import { NAMED_PROVIDERS_PHRASE, S3_PROVIDERS } from '@/config/providers';
import { isBlogEnabled } from '@/config/features';
import { isWordPressConfigured } from '@/lib/wordpress/client';
import { isBuilding, loadAllPostsHourly } from '@/lib/wordpress/blog-index';
import { buildLlmsTxt } from '@/lib/seo/llms-txt';

/**
 * /llms.txt. Rebuilt at most hourly, like the feed; the WordPress fetch asks
 * for the same hour, since a route regenerates as often as its shortest-lived
 * fetch.
 */
export const revalidate = 3600;

export async function GET(): Promise<Response> {
  let posts: Awaited<ReturnType<typeof loadAllPostsHourly>> = null;

  if (isBlogEnabled() && isWordPressConfigured()) {
    posts = await loadAllPostsHourly();
    // As with the feed: at run time, throw so Next.js keeps serving the last
    // file it built rather than caching one without the blog for an hour.
    // During the build there is none to keep, so the blog is left out.
    if (posts === null && !isBuilding()) {
      throw new Error('WordPress did not answer; keeping the last llms.txt');
    }
  }

  const body = buildLlmsTxt({
    siteUrl: SITE_URL,
    docsUrl: DOCS_URL,
    repositoryUrl: REPOSITORY_URL,
    providers: S3_PROVIDERS.filter((provider) => provider.id !== 'custom'),
    providersPhrase: NAMED_PROVIDERS_PHRASE,
    licenseName: LICENSE_NAME,
    posts,
  });

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

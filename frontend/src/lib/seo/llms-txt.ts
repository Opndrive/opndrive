/**
 * /llms.txt: a short, plain-Markdown map of the site for language-model tools,
 * following the llmstxt.org proposal - a title, a one-paragraph summary, then
 * sections of links with a line on each.
 *
 * It is a proposal, not a standard any search engine ranks on. It is here
 * because assistants that answer "how do I connect my R2 bucket to a web UI"
 * read it when it exists, and because it costs one cached route. It lists the
 * pages worth reading, not every URL; the sitemap does that.
 */

import type { BlogPostSummary } from '@/lib/wordpress/types';

export interface LlmsTxtInput {
  siteUrl: string;
  docsUrl: string;
  repositoryUrl: string;
  /** Named providers, in the order the site lists them. */
  providers: ReadonlyArray<{ slug: string; name: string; tagline: string }>;
  /** "Amazon S3, Cloudflare R2, ..." as the site words it. */
  providersPhrase: string;
  licenseName: string;
  /** null leaves the blog out: no blog, or nothing known about it. */
  posts: ReadonlyArray<Pick<BlogPostSummary, 'slug' | 'title' | 'excerpt'>> | null;
}

/** One line, no Markdown that could break the list it sits in. */
function oneLine(text: string, max = 200): string {
  const flat = text.replace(/\s+/g, ' ').replace(/[[\]]/g, '').trim();
  const chars = Array.from(flat);
  if (chars.length <= max) return flat;
  const cut = chars.slice(0, max).join('');
  return `${cut.slice(0, cut.lastIndexOf(' ')).trimEnd() || cut}…`;
}

function link(title: string, url: string, note?: string): string {
  return `- [${oneLine(title, 120)}](${url})${note ? `: ${oneLine(note)}` : ''}`;
}

export function buildLlmsTxt(input: LlmsTxtInput): string {
  const { siteUrl, docsUrl, repositoryUrl, providers, posts } = input;

  const sections = [
    '# Opndrive',
    '',
    `> Open-source web interface for S3-compatible storage. Connect your own bucket and manage its files - upload, organise into folders, preview and share - with complete control over your data. Works with ${input.providersPhrase} and any other S3-compatible endpoint.`,
    '',
    `Opndrive runs in the browser against the storage you connect, with your own access keys: there is no sign-up, and your files never pass through Opndrive's servers. You can use it at ${siteUrl} or host it yourself. It is licensed ${input.licenseName}.`,
    '',
    '## Get started',
    '',
    link(
      'Connect a bucket',
      `${siteUrl}/connect`,
      'Pick a provider and connect with your access keys.'
    ),
    ...providers.map((provider) =>
      link(`Connect ${provider.name}`, `${siteUrl}/connect/${provider.slug}`, provider.tagline)
    ),
    '',
    '## Documentation',
    '',
    link(
      'Opndrive documentation',
      docsUrl,
      'Self-hosting, configuration, CORS and troubleshooting.'
    ),
    link('Self-hosting with Docker', `${docsUrl}/getting-started/deployment`),
    link('Source code', repositoryUrl, 'The repository, issues and releases.'),
  ];

  if (posts && posts.length) {
    sections.push(
      '',
      '## Blog',
      '',
      ...posts.map((post) => link(post.title, `${siteUrl}/blog/${post.slug}`, post.excerpt))
    );
  }

  sections.push(
    '',
    '## Optional',
    '',
    ...(posts ? [link('Blog RSS feed', `${siteUrl}/blog/rss.xml`)] : []),
    link('Privacy policy', `${siteUrl}/privacy`, 'What the app stores, and where.'),
    link('Terms of service', `${siteUrl}/terms`),
    ''
  );

  return sections.join('\n');
}

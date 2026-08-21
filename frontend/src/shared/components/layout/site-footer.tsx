import Link from 'next/link';
import { FaGithub } from 'react-icons/fa';
import { DISCORD_URL, DOCS_URL } from '@/config/links';
import { LICENSE_NAME, LICENSE_URL, REPOSITORY_URL } from '@/config/legal';
import { isBlogEnabled } from '@/config/features';

interface FooterLink {
  label: string;
  href: string;
  external?: boolean;
}

interface FooterColumn {
  heading: string;
  links: FooterLink[];
}

function buildColumns(): FooterColumn[] {
  const resources: FooterLink[] = [
    { label: 'Documentation', href: DOCS_URL, external: true },
    { label: 'FAQ', href: '/#faq' },
  ];

  if (isBlogEnabled()) {
    resources.push({ label: 'Blog', href: '/blog' });
  }

  return [
    {
      heading: 'Product',
      links: [
        { label: 'Features', href: '/#features' },
        { label: 'Get started', href: '/connect' },
        { label: 'Self-host', href: `${DOCS_URL}/getting-started/deployment`, external: true },
      ],
    },
    { heading: 'Resources', links: resources },
    {
      heading: 'Community',
      links: [
        { label: 'GitHub', href: REPOSITORY_URL, external: true },
        { label: 'Discord', href: DISCORD_URL, external: true },
        {
          label: 'Contributing',
          href: `${REPOSITORY_URL}/blob/main/CONTRIBUTING.md`,
          external: true,
        },
      ],
    },
    {
      heading: 'Legal',
      links: [
        { label: 'Privacy Policy', href: '/privacy' },
        { label: 'Terms of Service', href: '/terms' },
        { label: 'Cookies and storage', href: '/privacy#storage' },
        { label: `License (${LICENSE_NAME})`, href: LICENSE_URL, external: true },
        { label: 'Security', href: `${REPOSITORY_URL}/security/policy`, external: true },
      ],
    },
  ];
}

function FooterAnchor({ link }: { link: FooterLink }) {
  const className = 'text-sm text-muted-foreground transition-colors hover:text-foreground';

  if (link.external) {
    return (
      <a href={link.href} className={className} target="_blank" rel="noopener noreferrer">
        {link.label}
      </a>
    );
  }

  return (
    <Link href={link.href} className={className}>
      {link.label}
    </Link>
  );
}

/**
 * Site footer for the marketing pages.
 *
 * Deliberately not rendered inside /dashboard: that is application chrome, and
 * a marketing footer does not belong in it. Dashboard users reach the same
 * legal pages through Settings and then Privacy.
 *
 * The line about analytics is doing real work. It is where a visitor learns
 * what we measure and how to turn it off, which is the transparency a consent
 * banner would otherwise be pretending to provide.
 */
export function SiteFooter() {
  const columns = buildColumns();

  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto w-full max-w-7xl px-5 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          {columns.map((column) => (
            <div key={column.heading}>
              <h3 className="text-sm font-semibold text-foreground">{column.heading}</h3>
              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <FooterAnchor link={link} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-4 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="" className="h-5 w-5" />
            <span className="text-sm text-muted-foreground">
              &copy; {new Date().getFullYear()} Opndrive
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <p className="text-xs text-muted-foreground">
              Cookieless analytics. No trackers.{' '}
              <Link href="/privacy#collected" className="underline hover:text-foreground">
                Opt out
              </Link>
              .
            </p>
            <a
              href={REPOSITORY_URL}
              className="text-muted-foreground transition-colors hover:text-foreground"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Opndrive on GitHub"
            >
              <FaGithub className="h-4 w-4" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

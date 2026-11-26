/**
 * Lets a button that navigates by script be counted like the link it stands
 * for. The landing page's "Get Started" picks /connect or /dashboard at click
 * time, so it is a button, and the page-wide link listener never sees it.
 *
 * Deliberately tiny and free of analytics code: it only announces the
 * destination. The tracker, which exists only in a build with analytics
 * configured, listens for it. Everywhere else nothing hears it.
 */
export const LINK_REPORT_EVENT = 'opndrive:link-report';

export function reportLinkFollowed(href: string): void {
  window.dispatchEvent(new CustomEvent(LINK_REPORT_EVENT, { detail: href }));
}

//  Central place for route visibility rules.

//  EXACT public routes – always accessible, no auth guard needed
export const PUBLIC_ROUTES = ['/', '/login', '/signup', '/forgot-password'] as const;

export type PublicRoute = (typeof PUBLIC_ROUTES)[number];

/* 2.  PREFIX-based protected areas – anything that starts with these 
    strings requires authentication (e.g. /dashboard/user/123).
    Useful because 404 pages keep the original path ("/abcd/efgh"),
     so exact matching is brittle.                                  */

export const PROTECTED_PREFIXES = ['/dashboard'] as const;

// Helper: true if a path is public (exact match)
export const isPublicPath = (path: string): boolean =>
  (PUBLIC_ROUTES as readonly string[]).includes(path);

// Helper: true if a path is protected (startsWith any prefix)
export const isProtectedPath = (path: string): boolean =>
  (PROTECTED_PREFIXES as readonly string[]).some((p) => path.startsWith(p));

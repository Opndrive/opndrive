'use client';

import { createContext, createElement, useContext, type ReactNode } from 'react';

/**
 * The star count the server fetched (see services/github-stars.ts), handed to
 * the navbars that show it.
 *
 * Null outside a provider and whenever GitHub did not answer: the count is
 * then simply not shown. Pages in the app have no provider, so the app never
 * shows it, and never asks GitHub for it.
 */
const StarsContext = createContext<number | null>(null);

export function GitHubStarsProvider({
  stars,
  children,
}: {
  stars: number | null;
  children: ReactNode;
}) {
  return createElement(StarsContext.Provider, { value: stars }, children);
}

export function useOpndriveStars(): { stars: number | null } {
  return { stars: useContext(StarsContext) };
}

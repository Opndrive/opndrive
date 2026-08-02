/**
 * Global test setup for the frontend package.
 *
 * The `vi.mock('zustand')` below is not optional decoration - it is what makes
 * `__mocks__/zustand.ts` take effect, which resets every store between tests.
 * Without it, stores keep their state across the whole file and tests silently
 * depend on the order they run in.
 */

import { vi } from 'vitest';

vi.mock('zustand');

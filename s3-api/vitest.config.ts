import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Tests live next to the code they cover (`foo.ts` -> `foo.test.ts`).
    // `src/tests/` predates that convention and still holds the
    // credential-gated integration suite, which this glob also picks up.
    include: ['src/**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      // json-summary backs the CI step that publishes the coverage table to
      // the GitHub run summary page; it is not useful locally on its own.
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        // Type-only modules compile to nothing, so they would otherwise show
        // up as 0% covered files that can never be covered.
        'src/core/types.ts',
        // Declaration files emit no executable code. v8 still lists them in
        // lcov with LF:0/LH:0, which downstream tools (Codecov, Coveralls)
        // render as a 0%-covered file that can never be fixed.
        'src/**/*.d.ts',
      ],
      // CI gate. Set below the numbers achieved at the end of Phase 1
      // (97.67 / 92.5 / 99.12 / 98.37) so ordinary refactoring has room to
      // move, while a genuine drop in covered behaviour fails the build.
      //
      // Branches sits lowest on purpose: the remaining gap is unreachable
      // defensive code that no test can close - see the `DEAD CODE:` and
      // `KNOWN BUG:` cases in multipartUploader.test.ts. Raising this to match
      // the others would require deleting source, not adding tests.
      thresholds: {
        statements: 95,
        branches: 90,
        functions: 95,
        lines: 95,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});

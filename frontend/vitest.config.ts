import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    // Activates __mocks__/zustand.ts, which resets every store after each test.
    setupFiles: ['./src/tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      // Phase 2 covers the state layer. Scoping the report to it keeps the
      // numbers meaningful instead of diluting them across thousands of
      // untested UI lines; widen this when component tests land.
      include: [
        'src/features/**/stores/**/*.ts',
        'src/features/**/services/**/*.ts',
        'src/services/**/*.ts',
        // Phase 3 adds the interaction layer: drop extraction and the drag
        // handlers. Components are still out of scope.
        'src/features/**/utils/folder-structure-processor.ts',
        'src/features/**/utils/drag-events.ts',
        'src/features/**/hooks/use-folder-drop-target.ts',
        // The single answer to whether an item is a file or a folder. Every
        // delete routes through it, so it is worth holding to a number.
        'src/shared/utils/drive-item.ts',
      ],
      exclude: ['**/*.test.{ts,tsx}'],
      // No thresholds yet - Phase 2 is only half written. Add them at the end,
      // the way s3-api did.
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});

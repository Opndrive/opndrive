/// <reference types="vitest/globals" />

// vitest.config.ts sets `globals: true`, which is load-bearing: React Testing
// Library only registers its automatic DOM cleanup when a global `afterEach`
// exists. Without this reference, `describe`/`it`/`expect` work at runtime but
// fail `tsc --noEmit` - and since `next build` type-checks, an idiomatic
// globals-style test would pass `pnpm test` locally and then break the build.
//
// Declared here rather than via `compilerOptions.types` on purpose: setting
// `types` explicitly would switch off automatic inclusion of every other
// @types package (node, etc.), which is a much bigger blast radius than the
// problem being solved.

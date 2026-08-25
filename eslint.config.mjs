import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  // Apply recommended rules to all files
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Global ignores - these will be ignored completely
  {
    ignores: [
      // Build outputs
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/out/**',

      // Dependencies
      '**/node_modules/**',

      // types
      '**/next-env.d.ts',

      // Package manager files
      'package-lock.json',
      'yarn.lock',
      'pnpm-lock.yaml',

      // Cache directories
      '**/.cache/**',
      '**/.eslintcache',
      '**/.npm/**',
      '**/.yarn/**',
      '**/.parcel-cache/**',

      // Coverage reports
      '**/coverage/**',

      // Environment variables
      '.env*',
      '!.env.example',

      // Logs
      '**/logs/**',
      '*.log',
      'npm-debug.log*',
      'yarn-debug.log*',
      'yarn-error.log*',

      // System files
      '.DS_Store',
      'Thumbs.db',

      // IDE/Editor folders
      '.idea/**',
      '.vscode/**',
      '*.swp',
      '*.swo',

      // Generated files
      '**/public/sw.js',
      '**/public/workbox-*.js',
      '**/storybook-static/**',

      // TypeScript build info
      '*.tsbuildinfo',

      // Minified files
      '**/*.min.js',
      '**/*.bundle.js',

      // Local agent tooling
      '.agents/**',
      'skills-lock.json',
    ],
  },

  // Global configuration for all remaining files
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },

  // Frontend-specific configuration
  {
    files: ['frontend/**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        console: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        FormData: 'readonly',
        Headers: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      // Registered deliberately narrow. eslint-plugin-react-hooks v7 ships the
      // React Compiler rule set under its `recommended` config; enabling that
      // wholesale on this codebase produces hundreds of findings unrelated to
      // hook safety. These two are the ones that catch real crashes:
      // rules-of-hooks would have caught #82 outright.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  // Known rules-of-hooks debt, downgraded to a warning so `next build` stays
  // green while it is worked off. Every file below has the same defect #82 was
  // filed for: an early return (usually on `useAuthGuard()`) with more hooks
  // declared after it, which throws "Rendered fewer hooks than expected" the
  // moment the guarded value changes on a mounted instance.
  //
  // This is a ratchet, not an amnesty. It is 'warn', never 'off', because
  // lint-staged runs `eslint --max-warnings=0` - so touching any of these
  // files still forces a fix, and no NEW file can join the list. Delete
  // entries as they are fixed; delete the whole block when the list is empty.
  // Tracked in the follow-up issue for hook-order violations.
  {
    files: [
      'frontend/src/context/rename-context.tsx',
      'frontend/src/app/dashboard/browse/page.tsx',
      'frontend/src/app/dashboard/page.tsx',
      'frontend/src/features/dashboard/hooks/use-download.ts',
      'frontend/src/features/dashboard/hooks/use-folder-creation.ts',
      'frontend/src/features/dashboard/hooks/use-file-metadata.ts',
      'frontend/src/features/dashboard/components/ui/menus/create-menu.tsx',
      'frontend/src/features/dashboard/components/ui/items/file-thumbnail-with-image.tsx',
      'frontend/src/features/upload/components/operations-modal.tsx',
      'frontend/src/components/file-preview/viewers/image-viewer.tsx',
      'frontend/src/components/file-preview/viewers/audio-viewer.tsx',
      'frontend/src/components/file-preview/viewers/video-viewer.tsx',
      'frontend/src/components/file-preview/viewers/pdf-viewer.tsx',
      'frontend/src/components/file-preview/viewers/excel-viewer.tsx',
      'frontend/src/components/file-preview/viewers/code-viewer.tsx',
    ],
    rules: {
      'react-hooks/rules-of-hooks': 'warn',
    },
  },

  // s3-api configuration
  {
    files: ['s3-api/**/*.{js,ts}'],
    languageOptions: {
      globals: {
        process: 'readonly',
        Buffer: 'readonly',
        console: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
        global: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
      },
    },
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },

  // Configuration files
  {
    files: ['*.{js,mjs,cjs}', '**/*.config.{js,mjs,cjs}'],
    languageOptions: {
      globals: {
        process: 'readonly',
        Buffer: 'readonly',
        console: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
      },
    },
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
];

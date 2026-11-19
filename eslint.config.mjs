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
      // Static imports only; `await import('xlsx')` is what this asks for.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'xlsx',
              message:
                "Load it where a spreadsheet is parsed, with `await import('xlsx')`. A static import puts the largest library in the app into every dashboard page, because the preview modal is part of the dashboard layout.",
            },
          ],
        },
      ],
      // Tests run against the react package, which has these; the app runs
      // against the React that Next.js bundles, which does not. So a test
      // passes and the production build only warns, while the page throws
      // "is not a function" the first time it renders.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "ImportDeclaration[source.value='react'] > ImportSpecifier[imported.name=/^(useEffectEvent|Activity)$/]",
          message:
            'Not in the React that Next.js bundles for the app router, so it is undefined in production. Use a ref for the latest callback instead.',
        },
        {
          selector:
            "MemberExpression[object.name='React'][property.name=/^(useEffectEvent|Activity)$/]",
          message:
            'Not in the React that Next.js bundles for the app router, so it is undefined in production. Use a ref for the latest callback instead.',
        },
      ],
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

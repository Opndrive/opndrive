# Configuration Files

Reference for the config files you'll actually touch while developing, as
opposed to ones you'll rarely open.

## `frontend/components.json` (shadcn/ui)

```json
{
  "style": "new-york",
  "tailwind": { "baseColor": "neutral", "cssVariables": true },
  "aliases": {
    "components": "@/components",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

Adding a new shadcn primitive with the CLI
(`pnpm dlx shadcn@latest add <component>`) reads this file to decide where the
component lands and how it's styled - "new-york" style, neutral base color, CSS
variables for theming, Lucide for icons.

## `frontend/tsconfig.json` - Path Aliases

```json
"paths": {
  "@/*": ["./src/*"],
  "@/shared/*": ["./src/shared/*"],
  "@/features/*": ["./src/features/*"],
  "@/services/*": ["./src/services/*"]
}
```

```typescript
// Good
import { Button } from '@/shared/components/ui/button';
import { useDriveStore } from '@/context/data-context';

// Avoid
import { Button } from '../../../shared/components/ui/button';
```

## `eslint.config.mjs` (repository root)

Shared between `frontend/` and `s3-api/`, with per-directory overrides (the
frontend config adds browser globals and the `react-hooks` plugin; `s3-api`
relaxes a few rules that don't make sense for a Node package). See
[Coding Standards](../contributing/coding-standards.md#a-note-on-hook-debt) for
the one section worth understanding in detail: a deliberately tracked list of
files with a downgraded `react-hooks/rules-of-hooks` rule.

## `prettier.config.js` (repository root)

Formats every JS/TS/JSON/Markdown/YAML/CSS/HTML file in the repo the same way,
both packages included. Run `pnpm format` to apply it, or let the pre-commit
hook apply it to staged files automatically.

# Development Setup

This guide will help you set up Opndrive for local development. Follow these
steps to get your development environment running quickly.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v18 or later) - [Download here](https://nodejs.org/)
- **PNPM** (v8 or later) - Install with `npm install -g pnpm`
- **Git** - [Download here](https://git-scm.com/)
- **VS Code** (recommended) - [Download here](https://code.visualstudio.com/)

### Optional but Recommended:

- **AWS CLI** - For S3 integration testing

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/Opndrive/opndrive.git
cd opndrive
```

### 2. Install Dependencies

```bash
# Install root dependencies
pnpm install

# Install frontend dependencies
cd frontend
pnpm install

# Install S3 API dependencies
cd ../s3-api
pnpm install
```

### 3. Start Development Server

```bash
cd frontend
pnpm dev
```

### 4. Open Your Browser

- **Frontend**: http://localhost:3000

**That's it!** Opndrive uses UI-based configuration - no need to manually edit
environment files. When you first visit the app, you'll see a "Get Started"
button that takes you to `/connect` where you can enter your AWS credentials
through the interface.

## Project Structure Understanding

After setup, familiarize yourself with the key directories:

```
opndrive/
├── frontend/src/
│   ├── app/                 # Next.js pages and layouts
│   ├── features/            # Feature-based components
│   │   └── dashboard/       # Main dashboard feature
│   ├── shared/              # Reusable components
│   ├── lib/                 # Utilities and configurations
│   └── types/               # TypeScript type definitions
└── s3-api/                  # Backend S3 integration
```

## Development Workflow

### 1. Branch Strategy

```bash
# Create a feature branch
git checkout -b feature/your-feature-name

# Make your changes
git add .
git commit -m "feat: add your feature description"

# Push and create PR
git push origin feature/your-feature-name
```

### 2. Code Quality Checks

Before committing, run these commands:

```bash
# Type checking
pnpm type-check

# Linting
pnpm lint

# Formatting
pnpm format

# Run all checks
pnpm check-all
```

### 3. Testing

```bash
# Run unit tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run E2E tests (when available)
pnpm test:e2e
```

## Working with Features

### Adding a New Feature

1. **Create the feature directory:**

```bash
mkdir -p frontend/src/features/your-feature
cd frontend/src/features/your-feature
```

2. **Create the basic structure:**

```bash
mkdir -p components/{ui,views,layout}
mkdir -p types
touch components/index.ts
touch types/index.ts
```

3. **Add to path aliases** in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "paths": {
      "@/features/your-feature/*": ["./src/features/your-feature/*"]
    }
  }
}
```

### Working with Components

1. **Use the component templates:**

```typescript
// Basic component template
'use client'

import { cn } from '@/lib/utils'

interface YourComponentProps {
  className?: string
  // other props
}

export function YourComponent({ className, ...props }: YourComponentProps) {
  return (
    <div className={cn("base-styles", className)} {...props}>
      {/* component content */}
    </div>
  )
}
```

2. **Export from index files:**

```typescript
// features/your-feature/components/index.ts
export { YourComponent } from './ui/your-component';
export type { YourComponentProps } from './ui/your-component';
```

## Styling Guidelines

### Tailwind CSS Setup

The project uses Tailwind CSS with custom design tokens:

```typescript
// Use design system classes
<div className="bg-background text-foreground border border-border">
  <h1 className="text-2xl font-semibold text-primary">Title</h1>
  <p className="text-muted-foreground">Description</p>
</div>
```

### Dark Mode Support

Components automatically support dark mode:

```typescript
// These classes adapt to light/dark mode automatically
<div className="bg-card text-card-foreground">
  <button className="bg-primary text-primary-foreground hover:bg-primary/90">
    Click me
  </button>
</div>
```

## S3 Integration

### Direct S3 Integration

Opndrive uses direct S3 integration through the browser with the s3-api package:

```typescript
import { s3Client } from '@/lib/byo-s3-api';

// Upload a file
const uploadFile = async (file: File, key: string) => {
  return await s3Client.upload({
    file,
    key,
    onProgress: (progress) => console.log(`Upload progress: ${progress}%`),
  });
};
```

### Configuration

Configure your S3 credentials in the environment variables:

```env
NEXT_PUBLIC_AWS_REGION=us-east-1
NEXT_PUBLIC_S3_BUCKET=your-bucket-name
```

## Debugging

### Common Issues and Solutions

**1. Module Resolution Errors**

```bash
# Clear Next.js cache
rm -rf .next
pnpm dev
```

**2. TypeScript Errors**

```bash
# Restart TypeScript server in VS Code
Cmd/Ctrl + Shift + P > "TypeScript: Restart TS Server"
```

**3. Styling Not Applied**

```bash
# Restart development server
pnpm dev
```

### Development Tools

- **React DevTools** - Browser extension for React debugging
- **Next.js DevTools** - Built-in development overlay
- **Tailwind CSS DevTools** - Browser extension for CSS debugging

## Performance Monitoring

### Bundle Analysis

```bash
# Analyze bundle size
ANALYZE=true pnpm build
```

### Development Metrics

Monitor these during development:

- **First Load JS**: < 100kb (check in browser dev tools)
- **Lighthouse Score**: > 90 (run in Chrome DevTools)
- **Core Web Vitals**: All green in production

## Deployment Preview

### Build and Test Locally

```bash
# Build the application
pnpm build

# Start production server
pnpm start

# Test production build
open http://localhost:3000
```

### Environment-specific Builds

```bash
# Development build
pnpm build:dev

# Staging build
pnpm build:staging

# Production build
pnpm build:prod
```

## Troubleshooting

### Getting Help

1. **Check the docs** - Read other files in the `/docs` folder
2. **Search issues** - Look for existing GitHub issues
3. **Ask questions** - Create a new issue with the question label
4. **Community** - Join our Discord/Slack (links in main README)

### Common Commands Reference

```bash
# Development
pnpm dev              # Start development server
pnpm build            # Build for production
pnpm start            # Start production server
pnpm lint             # Run ESLint
pnpm type-check       # Check TypeScript types

# Testing
pnpm test             # Run unit tests
pnpm test:watch       # Run tests in watch mode
pnpm test:coverage    # Run tests with coverage

# Utilities
pnpm clean            # Clean all build artifacts
pnpm format           # Format code with Prettier
pnpm check-all        # Run all quality checks
```

---

**You're all set!** Start exploring the codebase and building amazing features.
Don't forget to read the [Project Structure](./PROJECT_STRUCTURE.md) and
[Frontend Architecture](./FRONTEND_ARCHITECTURE.md) docs to understand the
codebase better.

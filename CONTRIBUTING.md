# Contributing to Opndrive

Thank you for your interest in contributing to Opndrive! We welcome
contributions from everyone and appreciate your help in making this project
better.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Making Changes](#making-changes)
- [Submitting Changes](#submitting-changes)
- [Style Guidelines](#style-guidelines)
- [Reporting Issues](#reporting-issues)

## Code of Conduct

This project and everyone participating in it is governed by our Code of
Conduct. By participating, you are expected to uphold this code. Please report
unacceptable behavior to [yashsangwan00@gmail.com].

## How Can I Contribute?

There are many ways you can contribute to Opndrive:

- **Reporting bugs** - Help us identify and fix issues
- **Suggesting features** - Propose new functionality or improvements
- **Writing code** - Submit bug fixes or new features
- **Improving docs** - Help make our documentation better
- **Testing** - Help test new features and bug fixes
- **UI/UX improvements** - Enhance the user interface and experience

## Getting Started

### Prerequisites

Before contributing, make sure you have:

- **Node.js** (v18 or later)
- **PNPM** (v8 or later)
- **Git**
- **VS Code** (recommended)

### Setup

1. **Fork and Clone**

   ```bash
   git clone https://github.com/your-username/opndrive.git
   cd opndrive
   ```

2. **Install Dependencies**

   ```bash
   # Install root dependencies
   pnpm install

   # Install frontend dependencies
   cd frontend
   pnpm install

   # Install S3 API dependencies
   cd ../s3-api
   pnpm install

   # Go back to root
   cd ..
   ```

3. **Add Upstream Remote**

   ```bash
   git remote add upstream https://github.com/Opndrive/opndrive.git
   ```

4. **Start Development**

   ```bash
   cd frontend
   pnpm dev
   ```

   Open http://localhost:3000 and you should see Opndrive running!

## Development Workflow

### Project Structure

Opndrive is organized as a monorepo with these main parts:

```
opndrive/
├── frontend/          # Next.js web application (main app)
├── s3-api/           # S3 integration library
├── docs/             # Documentation
├── package.json      # Root package with unified scripts
├── eslint.config.mjs # ESLint configuration
└── prettier.config.js # Prettier configuration
```

### Development Commands

```bash
# Start the frontend (main development command)
cd frontend
pnpm dev

# Code quality checks (run from root)
pnpm run lint              # Lint all code
pnpm run format           # Format all code
pnpm run check            # Run both lint and format checks

# Frontend-specific commands
pnpm run lint:frontend    # Lint only frontend
pnpm run format:frontend  # Format only frontend files
```

### No Backend Setup Needed

Opndrive connects directly to Amazon S3 - there's no separate backend server to
run! The app uses:

- **Frontend**: Next.js app that runs in your browser
- **S3 API**: Direct browser-to-S3 communication
- **UI Configuration**: Set up AWS credentials through the web interface

## Making Changes

### Branch Naming

Create descriptive branches:

- `feature/description` - New features
- `fix/description` - Bug fixes
- `docs/description` - Documentation changes
- `refactor/description` - Code improvements

Example:

```bash
git checkout -b feature/add-file-sharing
```

### Code Quality

Before committing, always run:

```bash
# From the root directory
pnpm run check
```

This will:

- Lint all code for errors and style issues
- Check formatting consistency
- Ensure code follows project standards

### Commit Messages

Use clear, descriptive commit messages following this format:

```
type(scope): description

[optional body]

[optional footer]
```

**Types:**

- `feat` - New features
- `fix` - Bug fixes
- `docs` - Documentation changes
- `style` - Code style changes (formatting, etc.)
- `refactor` - Code refactoring
- `test` - Adding or updating tests
- `chore` - Maintenance tasks

**Examples:**

```bash
feat(upload): add progress indicator for file uploads
fix(auth): resolve S3 connection timeout issues
docs(setup): update installation instructions
```

## Submitting Changes

### Before Submitting

1. **Update your fork:**

   ```bash
   git fetch upstream
   git checkout main
   git merge upstream/main
   ```

2. **Rebase your branch:**

   ```bash
   git checkout your-feature-branch
   git rebase main
   ```

3. **Run all checks:**

   ```bash
   pnpm run check
   ```

4. **Test your changes:**
   - Start the app: `cd frontend; pnpm dev`
   - Test your feature works as expected
   - Try different scenarios and edge cases

### Pull Request Guidelines

When creating a pull request:

- **Clear title and description** - Explain what your change does
- **Reference issues** - Link to any related GitHub issues
- **Include screenshots** - For UI changes, show before/after
- **Test instructions** - Help reviewers test your changes
- **Keep it focused** - One feature or fix per pull request

**Pull Request Template:**

```markdown
## What This PR Does

Brief description of changes

## Related Issues

Fixes #123

## How to Test

1. Start the app
2. Navigate to...
3. Try...

## Screenshots (if applicable)

[Add screenshots for UI changes]
```

## Style Guidelines

### Code Formatting

Opndrive uses automated formatting with Prettier and ESLint:

```bash
# Fix all formatting and linting issues
pnpm run format
pnpm run lint:fix

# Check without fixing
pnpm run format:check
pnpm run lint
```

### TypeScript

- **Use proper types** - Avoid `any`, prefer specific interfaces
- **Export types** - Make reusable types available to other files
- **Document complex types** - Add JSDoc comments for complex interfaces

```typescript
// ✅ Good
interface FileUploadProps {
  file: File;
  onProgress: (percentage: number) => void;
  onComplete: (result: UploadResult) => void;
}

// ❌ Avoid
interface Props {
  data: any;
  callback: Function;
}
```

### React Components

- **Use functional components** with hooks
- **Extract custom hooks** for complex logic
- **Keep components focused** - Single responsibility
- **Use proper prop types** - Full TypeScript interfaces

```typescript
// ✅ Good component structure
interface FileItemProps {
  file: FileItem
  selected?: boolean
  onSelect?: (file: FileItem) => void
}

export function FileItem({ file, selected, onSelect }: FileItemProps) {
  return (
    <div className="file-item" onClick={() => onSelect?.(file)}>
      {file.name}
    </div>
  )
}
```

### CSS and Styling

- **Use Tailwind CSS** for styling
- **Follow the design system** - Use CSS custom variables from `globals.css`
- **Responsive design** - Mobile-first approach with proper breakpoints
- **Consistent spacing** - Use Tailwind's spacing scale

```css
/* Use CSS custom variables instead of hardcoded colors */
.button {
  background-color: var(--primary);
  color: var(--primary-foreground);
}
```

### File Organization

Follow the feature-based architecture:

```
src/features/dashboard/
├── components/     # Feature-specific UI components
├── hooks/         # Custom hooks for the feature
├── services/      # Business logic and API calls
└── types/         # TypeScript interfaces and types
```

**Guidelines:**

- **New components** go in `src/features/[feature]/components/`
- **Shared utilities** go in `src/shared/`
- **Context providers** go in `src/context/`
- **Services** handle business logic, not components

## Reporting Issues

### Bug Reports

When reporting bugs, please include:

- **Clear title and description**
- **Steps to reproduce** the issue
- **Expected behavior** vs **actual behavior**
- **Screenshots** if applicable
- **Environment information** (OS, browser, version numbers)
- **Error messages** or logs

Use this template:

```
**Bug Description:**
A clear description of what the bug is.

**To Reproduce:**
1. Go to '...'
2. Click on '...'
3. See error

**Expected Behavior:**
What you expected to happen.

**Screenshots:**
If applicable, add screenshots.

**Environment:**
- OS: [e.g., Windows 10, macOS 12, Ubuntu 20.04]
- Node.js: [e.g., 18.x, 20.x]
- Package Manager: [e.g., pnpm 8.x]
- Browser: [e.g., Chrome 95, Firefox 94] (for frontend issues)
- Version: [e.g., 1.2.3]
```

## Feature Requests

When suggesting new features:

- **Use a clear title** that describes the feature
- **Provide detailed description** of the proposed functionality
- **Explain the motivation** - why would this feature be useful?
- **Consider alternatives** - are there other ways to achieve the same goal?
- **Provide examples** if possible

## Questions?

If you have questions about contributing, feel free to:

- Open an issue with the "question" label
- Reach out to the maintainers at [yashsangwan00@gmail.com]

## Troubleshooting

### Common Issues

**ESLint/Prettier conflicts:**

```bash
# Reset formatting and fix issues
pnpm run format
pnpm run lint:fix
```

**Pre-commit hooks failing:**

```bash
# Check what's failing
pnpm run check

# Fix issues and try again
pnpm run lint:fix
pnpm run format
git add .
git commit -m "your message"
```

**Dependencies out of sync:**

```bash
# Clean install all dependencies
rm -rf node_modules frontend/node_modules s3-api/node_modules
rm pnpm-lock.yaml frontend/pnpm-lock.yaml s3-api/pnpm-lock.yaml
pnpm install
```

## Getting Help

### Resources

- **Documentation** - Check the `docs/` folder for detailed guides
- **Issues** - Search existing GitHub issues before creating new ones
- **Discussions** - Use GitHub Discussions for questions and ideas

### Asking Questions

When asking for help:

1. **Be specific** - Describe exactly what you're trying to do
2. **Share code** - Include relevant code snippets or error messages
3. **Context** - Mention what you've already tried
4. **Environment** - Include OS, Node.js version, etc.

## Community

### Code of Conduct

Be respectful, inclusive, and helpful to all contributors. This project follows
standard open-source community guidelines.

## Recognition

Contributors are recognized in:

- Release notes for significant contributions
- README contributors section
- GitHub contributor graphs

---

Thank you for contributing to Opndrive! 🚀

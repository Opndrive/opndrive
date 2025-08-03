# Contributing Guide

Thank you for your interest in contributing to this project! We welcome
contributions from everyone and appreciate your help in making this project
better.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
- [Making Changes](#making-changes)
- [Submitting Changes](#submitting-changes)
- [Reporting Issues](#reporting-issues)
- [Feature Requests](#feature-requests)

## Code of Conduct

This project and everyone participating in it is governed by our Code of
Conduct. By participating, you are expected to uphold this code. Please report
unacceptable behavior to [yashsangwan00@gmail.com].

## How Can I Contribute?

There are many ways you can contribute to this project:

- **Reporting bugs** - Help us identify and fix issues
- **Suggesting enhancements** - Propose new features or improvements
- **Writing code** - Submit bug fixes or new features
- **Reviewing pull requests** - Help maintain code quality
- **Testing** - Help test new features and bug fixes

### Getting Started

1. Fork the repository on GitHub
2. Clone your fork locally:
   ```bash
   git clone https://github.com/your-username/opndrive.git
   cd opndrive
   ```
3. Install dependencies:
   ```bash
   pnpm install
   ```
4. Add the original repository as upstream:
   ```bash
   git remote add upstream https://github.com/Opndrive/opndrive.git
   ```

## Making Changes

### Branch Naming

Create a new branch for your work:

- `feature/description` for new features
- `bugfix/description` for bug fixes
- `docs/description` for documentation changes
- `refactor/description` for code refactoring

Example:

```bash
git checkout -b feature/add-user-authentication
```

### Development Workflow

This project uses a monorepo structure with both frontend and backend code:

```
opndrive/
├── frontend/          # Next.js frontend application
├── backend/           # Node.js/Express backend API
├── eslint.config.mjs  # Unified ESLint configuration with ignore patterns
├── prettier.config.js # Unified Prettier configuration
├── .prettierignore    # Prettier ignore patterns
└── package.json       # Root package with unified scripts
```

#### Running the Development Environment

```bash
# Install dependencies for all packages
pnpm install

# Start frontend development server
cd frontend
pnpm run dev

# Start backend development server
cd backend
pnpm run dev
```

#### Code Quality Checks

Before making changes, ensure your development environment follows our
standards:

```bash
# Check code quality across the entire project
pnpm run check

# Fix formatting and linting issues
pnpm run lint:fix
pnpm run format
```

### Commit Messages

Write clear, descriptive commit messages:

- Use the present tense ("Add feature" not "Added feature")
- Use the imperative mood ("Move cursor to..." not "Moves cursor to...")
- Limit the first line to 72 characters or less
- Reference issues and pull requests liberally after the first line

Example:

```
Add user authentication system

- Implement login/logout functionality
- Add password hashing with bcrypt
- Create user session management
- Fixes #123
```

## Submitting Changes

### Pull Request Process

1. Update your fork with the latest changes:

   ```bash
   git fetch upstream
   git checkout main
   git merge upstream/main
   ```

2. Rebase your feature branch:

   ```bash
   git checkout your-feature-branch
   git rebase main
   ```

3. Run tests and ensure your code follows the style guidelines:

   ```bash
   # Lint and format all code
   pnpm run check

   # Or check specific parts
   pnpm run lint:frontend
   pnpm run lint:backend
   pnpm run format:check
   ```

4. Push your changes:

   ```bash
   git push origin your-feature-branch
   ```

5. Create a pull request on GitHub with:
   - A clear title and description
   - Reference to any related issues
   - Screenshots if applicable
   - List of changes made

### Pull Request Guidelines

- Keep pull requests focused on a single feature or bug fix
- Follow the existing code style (enforced by ESLint and Prettier)
- Ensure all pre-commit hooks pass successfully
- Be responsive to feedback and make requested changes promptly
- Run `pnpm run check` before submitting to ensure code quality

## Style Guidelines

### Code Style

This project uses a unified ESLint and Prettier configuration managed from the
repository root. All code formatting and linting rules are automatically
enforced through:

- **ESLint**: For code quality and consistency
- **Prettier**: For code formatting
- **Husky + lint-staged**: For pre-commit hooks

#### Available Commands

```bash
# Linting
pnpm run lint                 # Lint both frontend and backend
pnpm run lint:frontend        # Lint only frontend
pnpm run lint:backend         # Lint only backend
pnpm run lint:fix             # Auto-fix linting issues

# Formatting
pnpm run format               # Format all files
pnpm run format:frontend      # Format only frontend files
pnpm run format:backend       # Format only backend files
pnpm run format:check         # Check formatting without fixing

# Combined checks
pnpm run check                # Run all linting and formatting checks
pnpm run check:frontend       # Check only frontend
pnpm run check:backend        # Check only backend
```

#### Pre-commit Hooks

The project automatically runs linting and formatting on staged files before
each commit. This ensures consistent code quality across all contributions.

#### Configuration Files

- `eslint.config.mjs` - Unified ESLint configuration for both frontend and
  backend with ignore directories
- `prettier.config.js` - Unified Prettier configuration
- `.prettierignore` - Files and directories to ignore during formatting

Follow the existing code formatting and naming conventions used in the project.

### Documentation Style

- Use clear, concise language
- Include code examples where helpful
- Keep line length under 80 characters for markdown files
- Use proper markdown formatting
- Follow the project's unified formatting rules (handled by Prettier)

### Pre-commit Hooks

This project uses Husky and lint-staged to automatically run code quality checks
before each commit:

- **ESLint**: Checks for code quality issues and enforces coding standards
- **Prettier**: Ensures consistent code formatting
- **Automatic fixing**: Many issues are automatically fixed during the
  pre-commit process

If the pre-commit hooks fail:

1. Review the error messages
2. Fix any remaining issues manually
3. Re-stage your files with `git add`
4. Commit again

To skip pre-commit hooks (not recommended):

```bash
git commit --no-verify -m "your message"
```

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
rm -rf node_modules frontend/node_modules backend/node_modules
rm pnpm-lock.yaml frontend/pnpm-lock.yaml backend/pnpm-lock.yaml
pnpm install
```

## Recognition

Contributors will be recognized in our README.md file and release notes. We
appreciate all contributions, no matter how small!

---

Thank you for contributing!

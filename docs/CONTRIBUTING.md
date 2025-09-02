# Contributing to OpnDrive

Thank you for your interest in contributing to OpnDrive! This guide will help
you get started with contributing to our open-source cloud storage solution.

## How to Contribute

There are many ways to contribute to OpnDrive:

- **Report bugs** and issues
- **Suggest new features** or improvements
- **Improve documentation**
- **Submit code changes** and fixes
- **Write tests** and improve coverage
- **Improve UI/UX** design
- **Add translations** and internationalization

## Getting Started

### 1. Fork and Clone

```bash
# Fork the repository on GitHub, then clone your fork
git clone https://github.com/your-username/opndrive.git
cd opndrive

# Add the original repository as upstream
git remote add upstream https://github.com/Opndrive/opndrive.git
```

### 2. Set Up Development Environment

Follow our [Development Setup Guide](./DEVELOPMENT_SETUP.md) to get your local
environment running.

### 3. Create a Branch

```bash
# Create a new branch for your feature/fix
git checkout -b feature/your-feature-name
# or
git checkout -b fix/issue-description
```

### 4. Make Your Changes

- Follow our [Code Standards](./CODE_STANDARDS.md)
- Write tests for new functionality
- Update documentation as needed
- Ensure your code follows our [Component Guidelines](./COMPONENT_GUIDELINES.md)

### 5. Test Your Changes

```bash
# Run type checking
pnpm type-check

# Run linting
pnpm lint

# Run tests
pnpm test

# Run all checks
pnpm check-all
```

### 6. Commit and Push

```bash
# Stage your changes
git add .

# Commit with a descriptive message (see commit conventions below)
git commit -m "feat: add file upload progress indicator"

# Push to your fork
git push origin feature/your-feature-name
```

### 7. Create a Pull Request

1. Go to the [OpnDrive repository](https://github.com/Opndrive/opndrive)
2. Click "New Pull Request"
3. Select your branch and describe your changes
4. Submit the pull request

## Commit Message Conventions

We use [Conventional Commits](https://www.conventionalcommits.org/) format:

```
type(scope): description

[optional body]

[optional footer(s)]
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, missing semi-colons, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks, dependency updates

### Examples

```bash
# Adding a new feature
git commit -m "feat(dashboard): add file upload progress indicator"

# Fixing a bug
git commit -m "fix(auth): resolve login redirect issue"

# Updating documentation
git commit -m "docs: update installation instructions"

# Refactoring code
git commit -m "refactor(components): simplify file item component"

# Adding tests
git commit -m "test(upload): add unit tests for file upload service"
```

### Scope Examples

- `dashboard`: Dashboard-related changes
- `auth`: Authentication system
- `upload`: File upload functionality
- `ui`: UI components
- `api`: API integration
- `docs`: Documentation
- `config`: Configuration files

## Reporting Bugs

When reporting bugs, please include:

1. **Clear description** of the issue
2. **Steps to reproduce** the bug
3. **Expected behavior** vs actual behavior
4. **Environment details** (OS, browser, Node.js version)
5. **Screenshots or videos** if applicable
6. **Error messages** or console logs

### Bug Report Template

```markdown
## Bug Description

A clear description of what the bug is.

## Steps to Reproduce

1. Go to '...'
2. Click on '...'
3. Scroll down to '...'
4. See error

## Expected Behavior

What you expected to happen.

## Actual Behavior

What actually happened.

## Environment

- OS: [e.g., Windows 11, macOS 13, Ubuntu 22.04]
- Browser: [e.g., Chrome 118, Firefox 119, Safari 17]
- Node.js: [e.g., 18.17.0]
- OpnDrive Version: [e.g., 1.2.3]

## Additional Context

Any other context about the problem.
```

## Feature Requests

When suggesting features:

1. **Describe the problem** you're trying to solve
2. **Explain your proposed solution**
3. **Consider alternatives** you've thought about
4. **Provide examples** or mockups if helpful

### Feature Request Template

```markdown
## Problem Statement

Describe the problem you're facing or the need you've identified.

## Proposed Solution

Describe your ideal solution to this problem.

## Alternative Solutions

Describe alternative solutions you've considered.

## Use Cases

Provide specific use cases where this feature would be valuable.

## Additional Context

Any other context, screenshots, or examples.
```

## Development Guidelines

### Code Style

- **TypeScript**: Use strict type checking
- **ESLint**: Follow our linting rules
- **Prettier**: Use for code formatting
- **Naming**: Use descriptive, clear names

### Component Development

- Follow our [Component Guidelines](./COMPONENT_GUIDELINES.md)
- Use feature-based organization
- Write comprehensive TypeScript types
- Include accessibility features
- Add proper error handling

### Testing Requirements

- **Unit tests** for utility functions and hooks
- **Component tests** for UI components
- **Integration tests** for complex workflows
- **Maintain >80% code coverage**

### Documentation

- Update relevant documentation for changes
- Add JSDoc comments for complex functions
- Include examples in component documentation
- Update README files when needed

## Pull Request Guidelines

### Before Submitting

- [ ] Code follows our style guidelines
- [ ] Tests pass locally
- [ ] Documentation is updated
- [ ] Commit messages follow conventions
- [ ] Branch is up to date with main

### PR Description Template

```markdown
## Description

Brief description of changes and the motivation behind them.

## Type of Change

- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to
      not work as expected)
- [ ] Documentation update

## Testing

- [ ] Tests pass locally
- [ ] New tests added for new functionality
- [ ] Manual testing completed

## Screenshots/Videos

If applicable, add screenshots or videos to help explain your changes.

## Checklist

- [ ] My code follows the style guidelines of this project
- [ ] I have performed a self-review of my own code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings
- [ ] Any dependent changes have been merged and published
```

### Review Process

1. **Automated checks** run (linting, tests, builds)
2. **Code review** by maintainers
3. **Testing** on different environments
4. **Approval** and merge

## Recognition

Contributors will be recognized in:

- **Contributors list** in README
- **Release notes** for significant contributions
- **Discord/community** shoutouts
- **Contributor badge** on profile

## Getting Help

If you need help:

1. **Check documentation** in the `/docs` folder
2. **Search existing issues** on GitHub
3. **Join our community** (Discord/Slack links in README)
4. **Create a discussion** on GitHub Discussions
5. **Ask questions** in issues with the "question" label

## Issue Labels

We use these labels to organize issues:

### Type Labels

- `bug`: Something isn't working
- `enhancement`: New feature or request
- `documentation`: Improvements or additions to docs
- `good first issue`: Good for newcomers
- `help wanted`: Extra attention is needed

### Priority Labels

- `priority: high`: Critical issues
- `priority: medium`: Important improvements
- `priority: low`: Nice to have features

### Status Labels

- `status: needs review`: Awaiting review
- `status: in progress`: Currently being worked on
- `status: blocked`: Cannot proceed due to dependencies

### Area Labels

- `area: frontend`: Frontend-related issues
- `area: backend`: Backend/API issues
- `area: docs`: Documentation issues
- `area: infrastructure`: DevOps/deployment issues

## Design Contributions

For UI/UX improvements:

1. **Follow our design system** principles
2. **Ensure accessibility** compliance
3. **Test on multiple devices** and screen sizes
4. **Provide Figma files** or design mockups when possible
5. **Consider dark mode** compatibility

## Internationalization

To add translations:

1. Check existing locale files in `/locales`
2. Add new language files following the existing structure
3. Test with right-to-left languages if applicable
4. Update language selection UI

## Code Standards

All contributors are expected to follow our coding standards and maintain a
respectful, collaborative environment.

### Our Standards

- **Be respectful** and inclusive
- **Accept constructive criticism** gracefully
- **Focus on what's best** for the community
- **Show empathy** towards other community members

## Git Hooks with Husky

This project uses [Husky](https://typicode.github.io/husky/) to ensure code
quality through automated Git hooks.

### Pre-commit Hooks

When you commit code, Husky automatically runs:

- **Linting**: ESLint checks for code quality issues
- **Type checking**: TypeScript compiler validates types
- **Formatting**: Prettier ensures consistent code style
- **Tests**: Runs relevant tests for changed files

### Setup

Husky is automatically installed when you run:

```bash
pnpm install
```

### Manual Hook Execution

You can also run the hooks manually:

```bash
# Run pre-commit hooks manually
npx husky run pre-commit

# Or run individual checks
pnpm lint
pnpm type-check
pnpm test
```

### Hook Configuration

Our hooks are configured in the `.husky/` directory:

- `pre-commit`: Runs before each commit
- `commit-msg`: Validates commit message format
- `pre-push`: Runs before pushing to remote

This ensures that only high-quality, properly formatted code makes it into the
repository!

## License

By contributing to OpnDrive, you agree that your contributions will be licensed
under the same license as the project.

---

**Thank you for contributing to OpnDrive!**

Your contributions help make cloud storage more accessible and user-friendly for
everyone. Whether it's a small bug fix or a major feature, every contribution is
valuable and appreciated.

_Happy coding!_

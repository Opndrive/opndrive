# Contributing to Opndrive

Thanks for your interest in contributing. This file covers the essentials; the
full guide (branching, commit conventions, testing, troubleshooting) lives in
[docs/content/contributing/first-contribution.md](./docs/content/contributing/first-contribution.md)
so there's one place to keep it accurate.

## Code of Conduct

This project follows the [Contributor Covenant](./CODE_OF_CONDUCT.md). Report
unacceptable behavior to yashsangwan00@gmail.com.

## Quick Start

```bash
# Fork the repo on GitHub, then:
git clone https://github.com/your-username/opndrive.git
cd opndrive
git remote add upstream https://github.com/Opndrive/opndrive.git

# Install dependencies
pnpm install

# Start developing
pnpm dev:frontend
```

Open http://localhost:3000 - you should see Opndrive running.

## Before You Open a Pull Request

```bash
# From the repository root
pnpm check       # lint + format check
pnpm typecheck   # type-check both packages
```

Then, from whichever package you changed:

```bash
pnpm test
```

## Where to Go Next

- **New to the project?** Start with the
  [Introduction](./docs/content/getting-started/introduction.md).
- **Ready to write code?** Read the
  [full Contributing Guide](./docs/content/contributing/first-contribution.md)
  for branch naming, commit conventions, and the PR process.
- **Found a bug or have an idea?**
  [Open an issue](https://github.com/Opndrive/opndrive/issues).

## License

By contributing, you agree that your contributions are licensed under the same
AGPL-3.0 license as the rest of the project.

---

Thank you for contributing to Opndrive.

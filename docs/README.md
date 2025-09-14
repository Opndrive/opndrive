# Opndrive Documentation

Welcome to Opndrive - your open-source cloud storage solution that works
directly with Amazon S3.

This guide will help you understand the project, set it up, and start
contributing. Don't worry if you're new to this.

## What is Opndrive?

Opndrive is like Google Drive or Dropbox, but with these cool differences:

- **Open Source** - You can see and modify all the code
- **Your Own Storage** - Uses your Amazon S3 bucket (you control your data)
- **No Vendor Lock-in** - Your files stay in your S3 bucket, not on our servers
- **Enterprise Features** - Built with the same patterns used by big companies

## Getting Started (New to Programming?)

If you're new to programming or this project, start here:

1. **[What You Need](./getting-started/prerequisites.md)** - Software you need
   to install
2. **[Quick Setup](./getting-started/quick-setup.md)** - Get Opndrive running in
   10 minutes
3. **[Your First Look](./getting-started/understanding-the-code.md)** - Tour of
   the codebase
4. **[Making Changes](./getting-started/making-your-first-change.md)** - How to
   contribute

## For Developers

Already comfortable with coding? Jump to these sections:

### Development

- **[Development Setup](./development/setup.md)** - Complete setup guide
- **[Project Structure](./development/project-structure.md)** - How the code is
  organized
- **[Contributing Guide](./development/contributing.md)** - How to contribute
  code

### Architecture

- **[Frontend Overview](./architecture/frontend.md)** - How the UI is built
- **[Component System](./architecture/components.md)** - How we organize
  components
- **[File Navigation](./architecture/navigation.md)** - How folder browsing
  works

## Documentation Organization

We've organized the docs into three main sections:

```
docs/
├── getting-started/     # Perfect for beginners
├── development/         # For active developers
├── architecture/        # Deep technical details
└── README.md           # This file!
```

## How to Contribute

We love contributions! Here's how you can help:

1. **Found a bug?** - Create an issue describing what went wrong
2. **Have an idea?** - Suggest new features or improvements
3. **Want to code?** - Pick up an existing issue or propose new changes
4. **Improve docs?** - Help make our documentation even better

## Need Help?

- **Stuck?** - Check our troubleshooting guides in each section
- **Questions?** - Create a GitHub issue with the "question" label
- **Want to chat?** - Join our community discussions

## What Makes Opndrive Special?

Unlike other cloud storage solutions, Opndrive:

- Connects directly to YOUR Amazon S3 bucket
- Gives you full control over your data
- Works with any S3-compatible storage (MinIO, DigitalOcean Spaces, etc.)
- Supports advanced features like multipart uploads and file sharing
- Has a modern, fast interface built with Next.js and TypeScript

---

**Built with ❤️ by the Opndrive team**

Ready to dive in? Start with
[What You Need](./getting-started/prerequisites.md)!

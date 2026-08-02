<img width="1920" height="719" alt="opndrive" src="https://github.com/user-attachments/assets/0368bf61-999b-4b17-979a-7cc7fd468976" />

# Opndrive

**Open-Source modern UI for S3 Compatible Storage Services**

Opndrive is a modern, open-source web UI for Amazon S3 and S3-compatible storage
services. Think of it like Google Drive or Dropbox, but instead of giving up
control, you connect your own storage backend - AWS S3.

## What Makes Opndrive Special?

- **Your Data, Your Control** - Files stored in YOUR S3 bucket, not ours
- **Modern Interface** - Built with Next.js 15, TypeScript, and Tailwind CSS
- **Direct Upload** - Browser-to-S3 uploads with multipart support for large
  files
- **Responsive Design** - Works perfectly on desktop, tablet, and mobile
- **Beautiful UI** - Clean, intuitive interface inspired by modern file managers

# Quick Start

## For Users (Just Want to Use It)

### Option 1: Run Locally

1. **Clone and Install**

   ```bash
   git clone https://github.com/Opndrive/opndrive.git
   cd opndrive
   pnpm install
   ```

2. **Start the App**

   ```bash
   pnpm dev:frontend
   ```

3. **Open Your Browser**
   - Go to [http://localhost:3000](http://localhost:3000)
   - Click **Get Started**
   - Enter your AWS S3 credentials in the UI
   - Start managing your files!

---

### Option 2: Run with Docker

From the repository root:

```bash
docker build -t opndrive .
docker run -d --restart unless-stopped --name opndrive -p 3000:3000 opndrive
```

See [Deployment](./docs/content/getting-started/deployment.md) for build args
and other hosting options (Vercel, Netlify).

Then:

- Go to [http://localhost:3000](http://localhost:3000)
- Click **Get Started**
- Enter your AWS S3 credentials in the UI
- Start managing your files!

### For Developers

**New to the Project?** Start with our
[Introduction](./docs/content/getting-started/introduction.md)

**Ready to Contribute?** Check out our
[Development Setup](./docs/content/development/setup.md)

## Architecture

Opndrive uses a modern, feature-based architecture:

```
opndrive/
├── frontend/           # Next.js 15 web application
├── s3-api/            # S3 integration layer
└── docs/               # Documentation site (content/ is the source of truth)
```

### Tech Stack

- **Frontend**: Next.js 15, React, TypeScript, Tailwind CSS
- **Storage**: Amazon S3 (or S3-compatible services)
- **State Management**: Zustand + React Context
- **UI Components**: Radix UI + Custom Design System
- **File Uploads**: Direct browser-to-S3 with multipart support

## Use Cases

- **Personal Cloud Storage** - Secure file storage and sharing
- **Team Collaboration** - Share files with colleagues
- **Media Management** - Organize photos, videos, and documents
- **Developer Assets** - Store and manage project files and assets
- **Business Documents** - Secure document management for organizations

## Features

### Current Features

- **File Browser** - Navigate folders like a native file manager
- **File Upload** - button upload with progress tracking
- **File Preview** - View images, PDFs, and text files directly
- **File Management** - Rename, delete, download files
- **Search** - Find files quickly across your storage
- **Multiple Upload Methods** - Multipart (pause/resume, large files) and
  signed-URL (faster for small files)
- **Responsive Design** - Works on all devices
- **Dark/Light Theme** - Choose your preferred interface

## Documentation

Full docs live in [`docs/content`](./docs/content/index.mdx), organized by
audience:

### **Getting Started** (Perfect for Beginners)

- [Introduction](./docs/content/getting-started/introduction.md)
- [Installation](./docs/content/getting-started/installation.md) - Get running
  in a few minutes
- [First Upload](./docs/content/getting-started/first-upload.md) - Connect your
  bucket and upload a file

### **Development** (For Contributors)

- [Development Setup](./docs/content/development/setup.md) - Complete setup
  guide
- [Repository Structure](./docs/content/development/repository-structure.md) -
  How code is organized
- [First Contribution](./docs/content/contributing/first-contribution.md) - How
  to contribute

### **Architecture** (Technical Deep Dive)

- [Frontend Architecture](./docs/content/development/frontend-architecture.md)
- [S3 API Layer](./docs/content/development/s3-api.md)
- [Component Guidelines](./docs/content/development/component-guidelines.md)

## Contributing

We welcome contributions from developers of all skill levels - bug reports,
features, docs, design, and tests. See [CONTRIBUTING.md](./CONTRIBUTING.md) for
the quick start, or the full
[Contributing Guide](./docs/content/contributing/first-contribution.md) for
branch naming, commit conventions, and the PR process.

## Development

```bash
pnpm install        # install all workspaces and run prepare
pnpm dev:frontend   # start the frontend dev server
pnpm test           # run the frontend test suite
pnpm lint           # lint frontend/ and s3-api/
```

See [Development Setup](./docs/content/development/setup.md) for the full guide,
and [Deployment](./docs/content/getting-started/deployment.md) for Vercel,
Netlify, and Docker.

## Security

- No files pass through our servers - direct browser-to-S3 communication
- Your AWS credentials are stored locally in your browser, never on a server
- Open source - you can audit all code yourself

Found a security vulnerability? Don't open a public issue - see
[SECURITY.md](./SECURITY.md) for how to report it privately.

## License

This project is licensed under the **GNU Affero General Public License v3.0** -
see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built with [Next.js](https://nextjs.org/) and [React](https://react.dev/)
- Styled with [Tailwind CSS](https://tailwindcss.com/)
- CRUD operations powered by
  [AWS SDK for JavaScript v3](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/index.html)
- UI components from [Radix UI](https://www.radix-ui.com/),
  [Shadcn UI](https://ui.shadcn.com/)
- Icons from [Lucide](https://lucide.dev/),
  [React Icons](https://react-icons.github.io/react-icons/)

## Support

- **Documentation**: [docs/content](./docs/content/index.mdx)
- **Bug reports and questions**:
  [Create an issue](https://github.com/Opndrive/opndrive/issues)
- **Security vulnerabilities**: [SECURITY.md](./SECURITY.md) - please don't use
  a public issue for these

---

**If you find Opndrive useful, please consider giving us a star on GitHub!**

_Made with ❤️ by the Opndrive Team_

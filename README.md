
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
   cd frontend; pnpm install
   ```

2. **Start the App**

   ```bash
   cd frontend
   pnpm dev
   ```

3. **Open Your Browser**
   - Go to [http://localhost:3000](http://localhost:3000)
   - Click **Get Started**
   - Enter your AWS S3 credentials in the UI
   - Start managing your files!

---

### Option 2: Run with Docker

1. **Run the Container**

   ```bash
   docker run -d --restart unless-stopped --name opndrive -p 3000:3000 opndrive/opndrive:1.0.0
   ```

2. **Open Your Browser**
   - Go to [http://localhost:3000](http://localhost:3000)
   - Click **Get Started**
   - Enter your AWS S3 credentials in the UI
   - Start managing your files!

### For Developers

**New to the Project?** Start with our
[Beginner's Guide](./docs/getting-started/prerequisites.md)

**Ready to Contribute?** Check out our
[Development Setup](./docs/development/setup.md)

## Architecture

Opndrive uses a modern, feature-based architecture:

```
opndrive/
├── frontend/           # Next.js 15 web application
├── s3-api/            # S3 integration layer
└── docs/              # Comprehensive documentation
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
- **Multiple Upload Methods** - Auto, signed-URL, multipart, concurrent
- **Responsive Design** - Works on all devices
- **Dark/Light Theme** - Choose your preferred interface

## Documentation

Our documentation is organized for different audiences:

### **Getting Started** (Perfect for Beginners)

- [What You Need](./docs/getting-started/prerequisites.md) - Software
  requirements
- [Quick Setup](./docs/getting-started/quick-setup.md) - Get running in 10
  minutes
- [Understanding the Code](./docs/getting-started/understanding-the-code.md) -
  Project tour

### **Development** (For Contributors)

- [Development Setup](./docs/development/setup.md) - Complete setup guide
- [Project Structure](./docs/development/project-structure.md) - How code is
  organized
- [Contributing Guide](./docs/development/contributing.md) - How to contribute

### **Architecture** (Technical Deep Dive)

- [Frontend Architecture](./docs/architecture/frontend.md) - Technical
  architecture
- [Component Guidelines](./docs/architecture/components.md) - Component patterns

## Contributing

We welcome contributions from developers of all skill levels!

### Quick Contribution Steps

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Make** your changes
4. **Test** your changes
5. **Commit** your changes (`git commit -m 'Add amazing feature'`)
6. **Push** to your branch (`git push origin feature/amazing-feature`)
7. **Open** a Pull Request

### Ways to Contribute

- **Report bugs** - Help us find and fix issues
- **Suggest features** - Share your ideas for improvements
- **Improve docs** - Help make our documentation better
- **Design improvements** - Enhance the user interface
- **Add tests** - Help improve code quality
- **Translations** - Help make Opndrive available in more languages

## Development

### Prerequisites

- Node.js 18+
- PNPM 8+
- Git

### Local Development

```bash
# Install dependencies
pnpm install

# Start development server
cd frontend && pnpm dev

# Run tests
pnpm test

# Check code quality
pnpm lint
```

## Deployment

### Docker (Coming Soon)

```bash
docker compose up
```

### Vercel/Netlify

Opndrive frontend can be deployed to any platform that supports Next.js
applications.

## Security

- All file operations use secure AWS API calls
- No files pass through our servers - direct browser-to-S3 communication
- Your AWS credentials are stored locally in your browser
- Open source - you can audit all code yourself

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

- **Documentation**: Check our [docs](./docs/) folder
- **Bug Reports**:
  [Create an issue](https://github.com/Opndrive/opndrive/issues)
- **Contact**: [Create an issue](https://github.com/Opndrive/opndrive/issues)
  for any questions

---

**If you find Opndrive useful, please consider giving us a star on GitHub!**

_Made with ❤️ by the Opndrive Team_

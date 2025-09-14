# What You Need to Get Started

Before you can run Opndrive on your computer, you need to install a few things.
Don't worry - it's easier than it sounds!

## Required Software

### 1. Node.js (The JavaScript Runtime)

Node.js lets you run JavaScript code on your computer (not just in web
browsers).

- **Download**: Go to [nodejs.org](https://nodejs.org/) and download the **LTS
  version** (Long Term Support)
- **Why you need it**: Opndrive is built with JavaScript/TypeScript, so we need
  Node.js to run it
- **Version needed**: Version 18 or newer

**How to check if you have it:**

```bash
node --version
```

You should see something like `v18.17.0` or higher.

### 2. PNPM (Package Manager)

PNPM helps manage the libraries and tools that Opndrive needs to work.

- **Install**: After installing Node.js, run this command:

```bash
npm install -g pnpm
```

- **Why you need it**: It downloads and manages all the code dependencies
- **Alternative**: You could use `npm` or `yarn`, but this project works best
  with pnpm

**How to check if you have it:**

```bash
pnpm --version
```

You should see something like `8.6.0` or higher.

### 3. Git (Version Control)

Git helps track changes to code and lets you download the Opndrive code from
GitHub.

- **Download**: Go to [git-scm.com](https://git-scm.com/) and download for your
  operating system
- **Why you need it**: To download the code and track your changes
- **Setup**: After installing, set your username and email:

```bash
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
```

**How to check if you have it:**

```bash
git --version
```

You should see something like `git version 2.41.0`.

## Recommended Software

### VS Code (Code Editor)

While you can use any text editor, VS Code is highly recommended because:

- It has excellent TypeScript support
- Great debugging tools
- Lots of helpful extensions

- **Download**: Go to [code.visualstudio.com](https://code.visualstudio.com/)
- **Extensions to install** (after installing VS Code):
  - TypeScript and JavaScript Language Features (usually built-in)
  - Prettier - Code formatter
  - ESLint
  - Auto Rename Tag
  - Bracket Pair Colorizer

## Optional but Helpful

### AWS CLI (for S3 testing)

If you plan to test with real Amazon S3 buckets:

- **Download**:
  [AWS CLI installation guide](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
- **Why**: Helps you manage S3 buckets and test connections

### GitHub Desktop (if you prefer GUI over command line)

- **Download**: [desktop.github.com](https://desktop.github.com/)
- **Why**: Makes it easier to work with Git if you're not comfortable with
  command line

## Quick Setup Check

After installing everything, open your terminal/command prompt and run these
commands to make sure everything works:

```bash
# Check Node.js
node --version

# Check PNPM
pnpm --version

# Check Git
git --version

# Create a test folder to make sure everything works
mkdir test-setup
cd test-setup
git init
echo "Hello Opndrive!" > test.txt
git add test.txt
git commit -m "Test setup"
cd ..
```

If all commands work without errors, you're ready for the next step!

## Troubleshooting

### "Command not found" errors

- **Windows**: Make sure the software is added to your PATH environment variable
- **Mac/Linux**: Try restarting your terminal or adding the installation
  directory to your PATH

### Permission errors on npm/pnpm install

- **Windows**: Run your terminal as Administrator
- **Mac/Linux**: Don't use `sudo` with npm. Instead,
  [configure npm to install packages globally without sudo](https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally)

### Still stuck?

- Create an issue on our GitHub repository with:
  - Your operating system (Windows 10, macOS Big Sur, Ubuntu 20.04, etc.)
  - The exact error message you're seeing
  - What command you ran when it failed

---

**Next Step**: Once everything is installed, continue to
[Quick Setup](./quick-setup.md) to get Opndrive running!

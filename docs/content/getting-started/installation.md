# Installation

Get Opndrive running locally. No AWS setup needed yet - that happens through the
app's UI in the next step, [First Upload](./first-upload.md).

## What You Need

| Tool                           | Version    | Check with       |
| ------------------------------ | ---------- | ---------------- |
| [Node.js](https://nodejs.org/) | 18+ (LTS)  | `node --version` |
| [PNPM](https://pnpm.io/)       | 8+         | `pnpm --version` |
| [Git](https://git-scm.com/)    | any recent | `git --version`  |

Install PNPM if you don't have it:

```bash
npm install -g pnpm
```

**Recommended**: [VS Code](https://code.visualstudio.com/) with the Prettier and
ESLint extensions - this repo's formatting is enforced, so having your editor
apply it as you type saves a round trip through CI.

## 1. Clone the Repository

```bash
git clone https://github.com/Opndrive/opndrive.git
cd opndrive
```

## 2. Install Dependencies

Opndrive is a two-package monorepo (no shared workspace), so each package
installs its own dependencies:

```bash
pnpm install              # root: lint/format tooling, Husky hooks

cd frontend
pnpm install

cd ../s3-api
pnpm install
cd ..
```

This downloads a fair amount - `frontend/` alone pulls in Next.js, the AWS SDK,
and the UI component libraries. A few minutes is normal.

## 3. Start the Dev Server

```bash
cd frontend
pnpm dev
```

```
- ready started server on 0.0.0.0:3000, url: http://localhost:3000
```

Open [http://localhost:3000](http://localhost:3000). You should see the Opndrive
landing page.

That's the whole setup - there's no `.env` file to create and no config to edit.
Opndrive is configured entirely through its UI, which is the next step:
[First Upload](./first-upload.md).

## Troubleshooting

**`command not found: pnpm`** - reinstall with `npm install -g pnpm` and restart
your terminal.

**Port 3000 already in use**

```bash
pnpm dev -- --port 3001
```

**`Cannot find module` errors**

```bash
rm -rf node_modules
pnpm install
```

**Still stuck?** [Open an issue](https://github.com/Opndrive/opndrive/issues)
with your OS, the exact error, and the command that triggered it.

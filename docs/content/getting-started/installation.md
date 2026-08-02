# Installation

Get Opndrive running locally. No AWS setup needed yet - that happens through the
app's UI in the next step, [First Upload](./first-upload.md).

## What You Need

| Tool                           | Version    | Check with       |
| ------------------------------ | ---------- | ---------------- |
| [Node.js](https://nodejs.org/) | 22         | `node --version` |
| [PNPM](https://pnpm.io/)       | 10.7.0     | `pnpm --version` |
| [Git](https://git-scm.com/)    | any recent | `git --version`  |

Node 22 is what `.nvmrc`, CI, and the Dockerfile all use - if you have nvm,
`nvm use` in the repo root selects it.

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

Opndrive uses a PNPM workspace. Install once from the repository root and PNPM
will install dependencies for `frontend/`, `s3-api/`, and `docs/`:

```bash
pnpm install
```

This also runs the root `prepare` script, which sets up Husky and builds the
`@opndrive/s3-api` workspace package. The first install downloads a fair amount

- Next.js, the AWS SDK, and the UI component libraries - so a few minutes is
  normal.

## 3. Start the Dev Server

```bash
pnpm dev:frontend
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
pnpm dev:frontend -- --port 3001
```

**`Cannot find module` errors**

```bash
rm -rf node_modules
pnpm install
```

**Still stuck?** [Open an issue](https://github.com/Opndrive/opndrive/issues)
with your OS, the exact error, and the command that triggered it.

# Build from the repo root, not frontend/:  docker build -t opndrive .
# The frontend needs the workspace's s3-api package and the root lockfile.

FROM node:22-alpine AS base

RUN npm install -g pnpm@10.7.0

WORKDIR /app

# No .git in the image, so husky has nothing to install.
ENV HUSKY=0

FROM base AS builder

# Manifests first - keeps the install layer cached when only source changes.
# All three are needed for --frozen-lockfile to validate.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY frontend/package.json ./frontend/
COPY s3-api/package.json ./s3-api/
COPY docs/package.json ./docs/

# pnpm reads this during install (see patchedDependencies in package.json).
COPY docs/patches ./docs/patches

# Skip scripts here: the root prepare builds s3-api, and its source isn't
# copied yet. Built explicitly below instead.
RUN pnpm install --frozen-lockfile --ignore-scripts \
    --filter frontend... --filter @opndrive/s3-api...

COPY s3-api ./s3-api
COPY frontend ./frontend

# The frontend imports s3-api's dist/, so build it first.
RUN pnpm --filter @opndrive/s3-api build

# Set late so toggling the flag doesn't rebuild the install above.
# NEXT_PUBLIC_* is baked in at build time, hence a build arg.
# Enabling this also requires WORDPRESS_GRAPHQL_URL, or the blog won't prerender.
ARG BLOG_STATUS="false"
ENV NEXT_PUBLIC_ENABLE_BLOG=$BLOG_STATUS

RUN pnpm --filter frontend build

FROM base AS runner

ENV NODE_ENV=production

COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./

# pnpm symlinks packages into a store at the workspace root, so both
# node_modules trees have to come along. s3-api ships whole - the frontend
# links straight back to it.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/s3-api ./s3-api
COPY --from=builder /app/frontend/node_modules ./frontend/node_modules
COPY --from=builder /app/frontend/package.json ./frontend/package.json
COPY --from=builder /app/frontend/next.config.ts ./frontend/next.config.ts
COPY --from=builder /app/frontend/.next ./frontend/.next
COPY --from=builder /app/frontend/public ./frontend/public

WORKDIR /app/frontend

EXPOSE 3000

RUN pnpm --version

CMD ["pnpm", "start"]

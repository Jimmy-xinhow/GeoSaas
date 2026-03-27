# ============================================================
# Geovault Web — Multi-stage Production Dockerfile
# Build context: monorepo root
# ============================================================

# ---------- Stage 1: Builder ----------
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9.1.0 --activate

WORKDIR /app

# Copy lockfile and workspace config first for layer caching
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./

# Copy package.json files for all workspace packages
COPY apps/web/package.json                    apps/web/package.json
COPY apps/api/package.json                    apps/api/package.json
COPY packages/database/package.json           packages/database/package.json
COPY packages/shared/package.json             packages/shared/package.json
COPY packages/tsconfig/package.json           packages/tsconfig/package.json

# Install all dependencies (including devDependencies for building)
RUN pnpm install --frozen-lockfile

# Copy full source needed for build
COPY packages/ packages/
COPY apps/web/ apps/web/

# Build shared package (web depends on it)
RUN pnpm --filter @geovault/shared build

# Build the Next.js app with production env vars hardcoded
ENV NEXT_PUBLIC_API_URL=https://api.geovault.app
ENV NEXT_PUBLIC_SITE_URL=https://geovault.app
RUN NEXT_PUBLIC_API_URL=https://api.geovault.app NEXT_PUBLIC_SITE_URL=https://geovault.app pnpm --filter @geovault/web build

# ---------- Stage 2: Runner ----------
FROM node:20-alpine AS runner

RUN apk add --no-cache dumb-init

ENV NODE_ENV=production
ENV NEXT_PUBLIC_API_URL=https://api.geovault.app
ENV NEXT_PUBLIC_SITE_URL=https://geovault.app
WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001 -G nodejs

# Copy Next.js standalone output and static files
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static

# Ensure public dir exists (may be empty)
RUN mkdir -p ./apps/web/public

USER nextjs

# Railway injects PORT env var
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
EXPOSE 3000

CMD ["dumb-init", "node", "apps/web/server.js"]

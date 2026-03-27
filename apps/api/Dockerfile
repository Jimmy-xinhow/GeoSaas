# ============================================================
# Geovault API — Multi-stage Production Dockerfile
# Build context: monorepo root
# ============================================================

# ---------- Stage 1: Builder ----------
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9.1.0 --activate

WORKDIR /app

# Copy lockfile and workspace config first for layer caching
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./

# Copy package.json files for all workspace packages
COPY apps/api/package.json                    apps/api/package.json
COPY apps/api/tsconfig.json                   apps/api/tsconfig.json
COPY apps/api/tsconfig.build.json             apps/api/tsconfig.build.json
COPY apps/api/nest-cli.json                   apps/api/nest-cli.json
COPY apps/web/package.json                    apps/web/package.json
COPY packages/database/package.json           packages/database/package.json
COPY packages/shared/package.json             packages/shared/package.json
COPY packages/tsconfig/package.json           packages/tsconfig/package.json

# Install all dependencies (including devDependencies for building)
RUN pnpm install --frozen-lockfile

# Copy full source
COPY packages/ packages/
COPY apps/api/ apps/api/

# Generate Prisma client
RUN pnpm --filter @geovault/database db:generate

# Build shared package (API depends on it)
RUN pnpm --filter @geovault/shared build

# Build the API
RUN pnpm --filter @geovault/api build

# Remove devDependencies in-place (keep the same node_modules tree)
RUN pnpm prune --prod

# ---------- Stage 2: Runner ----------
FROM node:20-alpine AS runner

RUN apk add --no-cache dumb-init openssl

ENV NODE_ENV=production
WORKDIR /app

# Copy node_modules (already has Prisma generated client in correct location)
COPY --from=builder /app/node_modules ./node_modules

# Copy shared package dist (workspace dependency)
COPY --from=builder /app/packages/shared/dist ./node_modules/@geovault/shared/dist
COPY --from=builder /app/packages/shared/package.json ./node_modules/@geovault/shared/package.json

# Copy Prisma schema (for runtime reference)
COPY --from=builder /app/packages/database/prisma/schema.prisma ./prisma/schema.prisma

# Copy built dist output
COPY --from=builder /app/apps/api/dist ./dist

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001 -G nodejs

USER nestjs

EXPOSE 4000

CMD ["dumb-init", "node", "dist/main.js"]

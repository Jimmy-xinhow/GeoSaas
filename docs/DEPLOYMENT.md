# GEO-SaaS Deployment Guide

## Architecture Overview

| Component | Platform | Notes |
|-----------|----------|-------|
| **Frontend** (Next.js) | Vercel | Auto-deploy from git |
| **Backend** (NestJS) | Docker / Cloud Run / Railway | Container-based |
| **Database** | Neon PostgreSQL | Serverless, cloud-hosted |
| **Cache / Queue** | Upstash Redis | Serverless, cloud-hosted |

---

## 1. Backend (API) Deployment

### Prerequisites

- Docker 20+ installed
- Environment file `apps/api/.env.production` configured (see `.env.production.example`)

### Build the Docker Image

From the **monorepo root**:

```bash
docker build -f apps/api/Dockerfile -t geo-saas-api:latest .
```

### Run with Docker Compose (Production)

```bash
cd docker
docker compose -f docker-compose.prod.yml up -d
```

### Run Standalone

```bash
docker run -d \
  --name geo-saas-api \
  -p 4000:4000 \
  --env-file apps/api/.env.production \
  geo-saas-api:latest
```

### Verify the API is Running

```bash
curl http://localhost:4000/api/health
# Expected: {"status":"ok","timestamp":"...","uptime":...,"environment":"production"}
```

### Database Migrations

Before first deploy (and on schema changes), run migrations against Neon:

```bash
DATABASE_URL="postgresql://..." pnpm --filter @geo-saas/database prisma migrate deploy
```

---

## 2. Frontend (Web) Deployment on Vercel

### Setup

1. Import the repository on [vercel.com](https://vercel.com).
2. Set the **Root Directory** to `apps/web`.
3. Vercel will automatically detect `vercel.json` configuration.
4. Set these environment variables in the Vercel dashboard:

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_API_URL` | `https://api.your-domain.com` |

### Manual Deploy

```bash
npx vercel --prod
```

---

## 3. Environment Variables

### Backend (`apps/api/.env.production`)

See `apps/api/.env.production.example` for the full list. Critical variables:

- `DATABASE_URL` -- Neon PostgreSQL connection string (with `?sslmode=require`)
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_TLS` -- Upstash Redis
- `JWT_SECRET` -- Minimum 32 characters
- `FRONTEND_URL` -- For CORS allowlist
- AI keys: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `PERPLEXITY_API_KEY`, `GEMINI_API_KEY`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`

### Frontend

- `NEXT_PUBLIC_API_URL` -- Backend API base URL

---

## 4. Health Check

The API exposes a public health endpoint:

```
GET /api/health
```

Response:

```json
{
  "status": "ok",
  "timestamp": "2026-03-04T10:00:00.000Z",
  "uptime": 3600,
  "environment": "production"
}
```

This endpoint is used by:
- Docker `HEALTHCHECK` directive
- Docker Compose health check
- Load balancer / orchestrator probes

---

## 5. Cloud Platform Alternatives

### Google Cloud Run

```bash
# Build and push
gcloud builds submit --tag gcr.io/PROJECT_ID/geo-saas-api
# Deploy
gcloud run deploy geo-saas-api \
  --image gcr.io/PROJECT_ID/geo-saas-api \
  --port 4000 \
  --set-env-vars "NODE_ENV=production" \
  --allow-unauthenticated
```

### Railway

1. Connect the repository.
2. Set root directory to monorepo root.
3. Set Dockerfile path to `apps/api/Dockerfile`.
4. Add environment variables from `.env.production.example`.

### Fly.io

```bash
flyctl launch --dockerfile apps/api/Dockerfile
flyctl secrets import < apps/api/.env.production
flyctl deploy
```

---

## 6. Post-Deployment Checklist

- [ ] `GET /api/health` returns `status: ok`
- [ ] Swagger docs accessible at `/docs` (disable in production if desired)
- [ ] Database migrations applied (`prisma migrate deploy`)
- [ ] CORS configured -- `FRONTEND_URL` matches the Vercel deployment URL
- [ ] Stripe webhook endpoint registered and secret configured
- [ ] SSL/TLS enabled on the API domain
- [ ] Logging and monitoring configured

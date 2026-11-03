# TaskFlow Deployment Guide

Take TaskFlow from localhost to something you can show people. Target stack:
**Vercel** for the frontend (Next.js) and **Render** for the backend (NestJS),
with a **MongoDB Atlas** database. A Fly.io / Docker path is included as an
alternative.

Everything below is repo-side and committed; the only manual steps are the
ones that need **your** accounts (creating the services and pasting secrets).

---

## 1. Architecture after deployment

```
Browser
  │  HTTPS
  ▼
Vercel (frontend, taskflow.vercel.app)
  │  NEXT_PUBLIC_API_URL=https://taskflow-api.onrender.com/api
  │  cookies: access_token / refresh_token (httpOnly, sameSite=lax)
  ▼
Render (backend, taskflow-api.onrender.com) — CORS_ORIGIN allows the Vercel URL
  │
  ▼
MongoDB Atlas (MONGODB_URI)
```

- Auth cookies are `secure` because `NODE_ENV=production` is set on Render.
- The backend's CORS is driven by `CORS_ORIGIN` (comma-separated origins).
- The frontend reads `NEXT_PUBLIC_API_URL` **at build time** — set it in Vercel
  before (or as part of) each deployment.

## 2. Environment variables

| Variable | Where | Required | Notes |
|---|---|---|---|
| `MONGODB_URI` | Render secret | yes | Atlas connection string |
| `JWT_ACCESS_SECRET` | Render secret | yes | `openssl rand -hex 32` |
| `JWT_REFRESH_SECRET` | Render secret | yes | `openssl rand -hex 32` |
| `CORS_ORIGIN` | Render | yes | your Vercel URL, e.g. `https://taskflow.vercel.app` |
| `COOKIE_SAME_SITE` | Render | no | `none` for cross-site Vercel→Render; default `lax` |
| `NEXT_PUBLIC_API_URL` | Vercel | yes | `https://taskflow-api.onrender.com/api` |
| `PORT` | Render auto-injects | no | `main.ts` already reads `process.env.PORT` |

> **CORS note:** `CORS_ORIGIN` should be an explicit list of origins. `*` is
> accepted but treated as "reflect the request origin" (wildcard + credentials
> is rejected by browsers). `GET /api/health` is `@Public()` and needs no auth.

> **Cookies note:** Vercel (`*.vercel.app`) and Render (`*.onrender.com`) are
> **cross-site**, so the auth cookies must be `SameSite=None`. Set
> `COOKIE_SAME_SITE=none` on Render (cookies are already `Secure` because
> `NODE_ENV=production`). Local dev and the tunnel demo keep the `lax` default.

Local dev mirrors are documented in `backend/.env.example` and
`frontend/.env.example`. The backend Joi schema fails fast at boot if
`MONGODB_URI` / the JWT secrets are missing — that's deliberate.

## 3. Seed the database

The seed script creates the demo accounts advertised on the login page
(`liya@taskflow.dev` admin, `abebe@taskflow.dev` manager, `hanna@taskflow.dev`
member — all with password `DemoPass123!`), plus optional demo content.

```bash
cd taskflow/backend

# users only (needs MONGODB_URI in backend/.env or env)
npm run seed

# users + team, project, 6 tasks, and an active sprint
npm run seed -- --demo
```

Idempotent: safe to re-run. Existing accounts get their demo password reset;
demo content is created only once (keyed on the project name).

> Point it at Atlas with `MONGODB_URI=mongodb+srv://… npm run seed -- --demo`
> **before** deploying the backend so the first request already has data.

## 4. Deploy the backend to Render

1. Push this repo to GitHub (Render deploys from a Git remote).
2. Render dashboard → **New → Blueprint** → select the repo.
3. Render reads the committed `render.yaml` and creates the `taskflow-api`
   Web Service (rootDir `taskflow/backend`, health check `/api/health`).
4. Fill in the four secrets Render flags as missing:
   `MONGODB_URI`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CORS_ORIGIN`.
5. Deploy. Wait for the deploy log to finish, then confirm
   `https://taskflow-api.onrender.com/api/health` returns `{"status":"ok","db":"connected"}`.

> Blueprint gotcha: `NODE_ENV=production` makes npm skip devDependencies, so
> the build command must be `npm ci --include=dev && npm run build` (already
> set in `render.yaml`) or the `nest` CLI is missing and the build fails with
> `sh: nest: not found`.

## 5. Deploy the frontend to Vercel

1. Vercel → **Add New Project** → import the same repo.
2. Framework preset: **Next.js** (auto-detected). Set:
   - **Root Directory:** `taskflow/frontend`
   - **Environment Variables:** `NEXT_PUBLIC_API_URL = https://taskflow-api.onrender.com/api`
3. Deploy. The monorepo config (`outputFileTracingRoot` in `next.config.mjs`)
   is already set up for npm-workspace installs at the repo root.
4. Visit the site, sign in with `abebe@taskflow.dev` / `DemoPass123!`.

> If you ever change `NEXT_PUBLIC_API_URL`, redeploy — it's inlined at build time.

## 6. Alternative: Fly.io (or any container host)

A production Dockerfile lives at `taskflow/Dockerfile` (build context =
monorepo root). For Fly.io:

```bash
cd taskflow
fly launch --no-deploy          # selects the Dockerfile
fly secrets set MONGODB_URI=… JWT_ACCESS_SECRET=… JWT_REFRESH_SECRET=… CORS_ORIGIN=https://taskflow.vercel.app
fly deploy
```

Health check: `fly curl http://localhost:3001/api/health` (set internal port 3001).

## 7. CI pipeline

`.github/workflows/ci.yml` runs on every push/PR to `main`:

- **Backend:** lint → unit tests (in-memory MongoDB, no services needed) →
  build → e2e smoke tests.
- **Frontend:** lint → production build (type-checks every page).

Backend lint is **advisory** in CI (not a gate) while ~260 pre-existing
`@typescript-eslint` type-aware errors are cleaned up — tests + build are the
gates. Frontend lint is a hard gate.

Fix a lint/test failure locally with:

```bash
cd taskflow
npm run lint --workspace backend
npm test --workspace backend
npm run build --workspace backend
npm run test:e2e --workspace backend
npm run lint --workspace frontend
npm run build --workspace frontend
```

## 8. Show-it-to-people checklist

- [ ] `/api/health` shows `db: "connected"` on the deployed backend.
- [ ] Login works with all three demo accounts (roles land on different pages).
- [ ] Admin (`liya@…`): Users + Teams pages render.
- [ ] Manager (`abebe@…`): dashboard charts, reports, create project/task/sprint.
- [ ] Member (`hanna@…`): sees only the projects they belong to.
- [ ] Sprint board + burndown render on the seeded demo sprint.
- [ ] Cookies are `Secure; HttpOnly; SameSite=Lax` in the browser devtools.
- [ ] A fresh `git push` triggers the CI workflow and it's green.

## 9. Cost & limits (free tiers)

- **Vercel**: free hobby plan — fine for a demo (serverless, auto-scaling).
- **Render**: free web service sleeps after 15 min of inactivity → first
  request after idle takes ~30–60 s to wake. Budget-friendly, slightly slow.
- **MongoDB Atlas**: M0 free cluster — 512 MB storage, enough for the demo.

If the Render cold-start bothers you when demoing, do a warm-up `curl` before
the demo, or move the backend to Fly (no sleep, ~$0–$5/mo at this scale).

# 01 — Project Setup

**Sprint:** 1  
**Date:** 2026-07-26  
**Status:** Complete

---

## What We Built

A monorepo containing two applications:

```
taskflow/
├── backend/        ← NestJS API server
├── frontend/       ← Next.js 15 UI
├── docs/           ← SRS, UML diagrams, learning notes
└── package.json    ← npm workspace root
```

---

## Why a Monorepo?

A monorepo keeps both applications in one Git repository.

Benefits:
- One `git clone` to get the entire project
- One pull request can include both frontend and backend changes
- TypeScript types can be shared between both apps later
- Simpler for a two-app project at this scale

We used **npm workspaces** rather than complex tools like Nx or Turborepo.
At two packages, those tools add more complexity than value.

---

## Why `"private": true` in the Root `package.json`?

The root `package.json` is not an application — it is a workspace coordinator.
`"private": true` prevents accidentally publishing the entire monorepo to the npm registry.

Without it, running `npm publish` from the root would upload all source code
(including potential secrets) as a public package.

---

## Why Dependencies Live in Each App, Not the Root

The root `package.json` only declares workspaces.
Each app (`backend/`, `frontend/`) has its own `package.json` with its own dependencies.

When you run `npm install` from the root, npm:
1. Reads all workspace `package.json` files
2. Resolves the entire dependency graph
3. Installs everything into a shared `node_modules` at the root (hoisting)

The root ends up with a `node_modules` folder, but the root `package.json` doesn't
declare any dependencies — because it is the manager, not the application.

---

## Why Node.js 22 LTS?

Node.js releases two tracks:
- **Current** — latest features, not yet battle-tested (e.g. Node 26)
- **LTS (Long Term Support)** — stable, widely tested, supported for 3 years (e.g. Node 22)

The entire npm ecosystem (NestJS, Next.js, Mongoose) runs CI against LTS versions.
Using the Current track can cause subtle installation failures because packages
haven't been tested against it yet.

**Rule:** Always use the Active LTS for production and learning projects.

---

## Environment Variables

Sensitive configuration (database passwords, JWT secrets) lives in `.env` files.
These are never committed to Git — the `.gitignore` explicitly excludes them.

```
backend/.env        ← contains MONGODB_URI, JWT secrets
```

In code, we access them via `ConfigService` from `@nestjs/config`,
never via `process.env` directly.

**Why?** `process.env` has no type safety — it silently returns `undefined`
if a variable is missing. `ConfigService` centralizes config access and can be
mocked in tests.

---

## MongoDB Connection

We use `MongooseModule.forRootAsync()` with a factory function rather than
`MongooseModule.forRoot()` with a hardcoded string.

**Why async?** The factory pattern ensures `ConfigService` is fully initialized
before the database connection is attempted. If we used `forRoot(process.env.MONGODB_URI)`,
the env variable might not be loaded yet.

---

## Key Takeaways

- Monorepo = one repo, multiple apps, shared tooling
- `"private": true` = do not publish to npm
- Root `package.json` coordinates, apps declare their own dependencies
- Always use Node.js LTS for projects
- Secrets live in `.env`, accessed via `ConfigService`, never committed to Git
- `forRootAsync` guarantees config is ready before the DB connection is made

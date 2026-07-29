# Taskflow — Software Engineer Residency

Taskflow is a full-stack demo project (monorepo) implementing a task and project management application. It pairs a NestJS backend with a Next.js frontend to demonstrate authentication, role-based access control (RBAC), Mongoose data models, event-driven notifications, and a React dashboard UI.

Key use cases: user and team management, project and task CRUD, comments, reports, and notification events — useful as a learning/residency project or starter template.

## Tech stack

- Language: TypeScript (primary)
- Backend: NestJS
- Frontend: Next.js (App Router)
- Database: MongoDB with Mongoose
- Auth: Passport + JWT (access + refresh tokens, HTTP-only cookies)
- Styling: Tailwind CSS
- Charts: Recharts

## Repository layout

```
taskflow/            Monorepo workspace (npm workspaces)
  backend/           NestJS backend (src/, package.json, tests)
  frontend/          Next.js frontend (app/, components/, lib/)
  docs/              Project docs and SRS artifacts
  diagrams/          Architecture diagrams
CLAUDE.md            Developer guidance and commands
```

### Important backend files
- taskflow/backend/src/main.ts — application bootstrap (CORS, cookie-parser, ValidationPipe, /api prefix)
- taskflow/backend/src/app.module.ts — registers feature modules, DB, ConfigModule and global guards (JwtAuthGuard, RolesGuard)
- taskflow/backend/.env.example — example environment variables

### Important frontend files
- taskflow/frontend/app/ — Next.js App Router pages (dashboard, login, projects, tasks, users)
- taskflow/frontend/components/ — reusable React components
- taskflow/frontend/lib/ — API client and utilities
- taskflow/frontend/next.config.mjs — Next.js configuration

## Quickstart (development)

Prerequisites:
- Node.js (v18+ recommended)
- npm
- MongoDB instance (local or remote)

1. Install dependencies

```bash
cd taskflow
npm install
```

2. Configure environment (backend)

Copy the example env and set your values:

```bash
cd taskflow/backend
cp .env.example .env
# then edit .env to set MONGODB_URI, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, etc.
```

3. Start the backend (dev)

```bash
cd taskflow/backend
npm run start:dev
# Default port: process.env.PORT or 3000
```

4. Start the frontend (dev)

```bash
cd taskflow/frontend
npm run dev
# Frontend origin expected by backend CORS: http://localhost:3001
```

Notes:
- The backend enables CORS for origin http://localhost:3001 and uses cookie-parser to support HTTP-only cookie-based JWT authentication.
- API endpoints are prefixed with /api (e.g., POST /api/auth/login, GET /api/projects).

## Build / Production

Backend:

```bash
cd taskflow/backend
npm run build
npm run start:prod
```

Frontend:

```bash
cd taskflow/frontend
npm run build
npm run start
```

## Testing

Backend unit tests and e2e tests use Jest. Run:

```bash
cd taskflow/backend
npm run test
npm run test:e2e
```

## Environment variables (backend)

- MONGODB_URI — MongoDB connection string (required)
- JWT_ACCESS_SECRET — JWT access token secret (required)
- JWT_REFRESH_SECRET — JWT refresh token secret (required)
- PORT — backend listen port (optional)

## Contributing

Contributions are welcome. Suggested workflow:
- Fork the repository
- Create a feature branch (git checkout -b feat/short-description)
- Run lint and tests locally before opening a PR
  - Backend lint: `cd taskflow/backend && npm run lint`
  - Frontend lint: `cd taskflow/frontend && npm run lint`

Follow existing code patterns for DTOs, services, and controllers in NestJS and keep React components small and composable in the frontend.

## License

This repository is provided for learning/demo purposes. See repository metadata for licensing details.

## Where to look next
- Backend: taskflow/backend/src — explore auth/, users/, projects/, tasks/, comments/ and database/ for Mongoose schemas and services.
- Frontend: taskflow/frontend/app — review pages and components for how the UI calls the API.

If you want, I can also:
- Open a PR adding this README.md to the repository
- Extract and include a sample .env.example with explanations for each variable
- Generate a short CONTRIBUTING.md with test and commit guidelines

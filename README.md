# Taskflow

Taskflow is a full-stack task and project management application (monorepo) pairing a NestJS backend and a Next.js frontend. This repository was previously named `software-engineer-residency` and has been renamed to `taskflow` for clarity.

> Post-rename: update your local remotes and references. See POST-RENAME-CHECKLIST.md for details.

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
POST-RENAME-CHECKLIST.md  Checklist for collaborators after repo rename
```

### What I changed
- Updated the repository README to use the new name `taskflow` and added a note about the rename.

### Next steps I can do for you
- Update package.json name fields in backend/frontend to align with the repo name.
- Add a CONTRIBUTING.md and update .github metadata.


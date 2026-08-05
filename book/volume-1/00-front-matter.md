# Front Matter

## Title

# Building Production-Ready Web Applications with TaskFlow

### Volume I — Backend Foundations

*A real software engineering book built on one real project.*

---

## Preface

Most backend books teach you a framework. This one teaches you how to *think*
about backend systems — and it uses a single, real, working project to do it.

That project is **TaskFlow**: a team task-management application. It has users,
teams, projects, tasks, comments, notifications, reports, authentication,
authorization, scheduled jobs, and an event-driven notification pipeline. It is
not a toy. It is a production-shaped NestJS + MongoDB application with hundreds
of tests, role-based access control, and a frontend that talks to it over HTTP.

Every concept in this book is explained twice:

1. **From first principles** — what it is, why it exists, how it works under the hood.
2. **In TaskFlow** — the exact file, function, and line where the concept lives.

By the end of Volume I you will know TaskFlow's backend better than its own
authors — and, more importantly, you will be able to build and defend a
production backend of your own.

Volume I covers the **backend**: from the moment a request leaves a browser to
the moment MongoDB returns a document. A companion volume (Volume II) covers
the frontend — React, Next.js, and the browser side of the story. Here, the
browser appears only as the *client* that starts every request.

---

## Who this book is for

This book is for developers who:

- know basic JavaScript and can read code, but have never built a backend;
- have built small backends with Express or similar and want to understand what
  "production-ready" actually means;
- are preparing for backend engineering interviews and want real answers, not
  memorized definitions;
- want to study one codebase deeply enough to use it as a reference for years.

You do **not** need to know NestJS, MongoDB, or TypeScript before starting.
Chapters 1–3 build the foundations you need. You do need to be comfortable
installing software and running commands in a terminal.

---

## How to read this book

The book is written to be read **in order, once**, and then **out of order,
forever**, as a reference.

- **Parts I–IV** are the backbone. Read them in order. They build the
  foundations (web fundamentals, Node.js, TypeScript), then the framework
  (NestJS), then the database (MongoDB), then security (authentication and
  authorization).
- **Parts V–VIII** are the professionalization layers — architecture, real
  systems (notifications, background jobs), testing, and production concerns.
  Each can be read independently once the backbone is in place.
- **The appendices** are pure reference. Use them when you need them.

Every chapter has exercises. Do the concept exercises at minimum — they take
five minutes and cement the mental model. The mini-projects are optional but
are where the real learning happens.

### A note on pace

This is a ~500-page book. Do not read it in a weekend. The design is a
**semester-long arc**: one part per week, with the exercises as homework.
Interview questions at the end of each chapter double as self-tests — if you
can answer all of them from memory, you know the chapter.

---

## Setting up TaskFlow

Every chapter assumes you have TaskFlow running. Setup takes about ten minutes.

### Prerequisites

- **Node.js** 20+ (TaskFlow targets modern Node with native TypeScript support).
- **npm** (comes with Node).
- **MongoDB** — either a local install or Docker. TaskFlow's tests use an
  in-memory MongoDB, but the dev server needs a real one.
- **Git** (to check out the code and follow the real commit history).

### 1. Get the code

```bash
git clone <your-taskflow-repo-url> taskflow
cd taskflow
```

The monorepo has three top-level pieces you will see referenced constantly:

```
taskflow/
├── backend/    # NestJS API — the subject of this volume
├── frontend/   # Next.js app — the client (Volume II's subject)
└── docs/       # Requirements, design docs, learning notes
```

### 2. Install dependencies

```bash
cd taskflow
npm install          # installs backend + frontend (npm workspaces)
```

### 3. Start MongoDB

If MongoDB is installed locally:

```bash
mongod --dbpath ~/data/db
```

Or with Docker:

```bash
docker run -d -p 27017:27017 --name taskflow-mongo mongo:7
```

MongoDB's default port is **27017** — the number you will see in connection
strings throughout this book.

### 4. Configure the backend

Copy the example environment file (the repo ships one) and adjust if needed:

```bash
cd backend
cp .env.example .env   # if present; otherwise create .env from the README
```

The critical values are the MongoDB URI and the JWT secrets:

```bash
MONGODB_URI=mongodb://localhost:27017/taskflow
JWT_ACCESS_SECRET=<long-random-string>
JWT_REFRESH_SECRET=<another-long-random-string>
PORT=3001
```

### 5. Run the backend

```bash
cd backend
npm run start:dev      # watch mode — restarts on every save
```

You should see:

```
Application running on: http://localhost:3001/api
```

The `/api` prefix is set globally in `backend/src/main.ts` — every route in this
book is prefixed with it.

### 6. Run the frontend (optional for Volume I)

```bash
cd frontend
npm run dev            # Next.js dev server on http://localhost:3000
```

The frontend is not the subject of this volume, but Chapter 1's walkthrough
traces requests that start there, and it is the easiest way to watch the system
work end to end.

### 7. Create the demo accounts (strongly recommended)

TaskFlow has **no seed script** — the demo accounts shown on the login page
(liya, abebe, hanna) must be created through the API itself, which is a useful
first exercise in the request/response mechanics of Chapter 1. Start the
backend, then create each user with `curl`. Note the password rules
(NFR-006): at least 8 characters, one number, one special character:

```bash
# Administrator
curl -X POST http://localhost:3001/api/users \
  -H "Content-Type: application/json" \
  -d '{"firstName":"Liya","lastName":"Kebede","email":"liya@taskflow.dev","password":"TaskFlow1!","role":"Administrator"}'

# Project Manager
curl -X POST http://localhost:3001/api/users \
  -H "Content-Type: application/json" \
  -d '{"firstName":"Abebe","lastName":"Bekele","email":"abebe@taskflow.dev","password":"TaskFlow1!","role":"ProjectManager"}'

# Team Member
curl -X POST http://localhost:3001/api/users \
  -H "Content-Type: application/json" \
  -d '{"firstName":"Hanna","lastName":"Girma","email":"hanna@taskflow.dev","password":"TaskFlow1!","role":"TeamMember"}'
```

The demo accounts are used in examples throughout the book:

| Role | Email | Notes |
|------|-------|-------|
| Administrator | `liya@taskflow.dev` | Admin — full visibility |
| Project Manager | `abebe@taskflow.dev` | PM — manages projects |
| Team Member | `hanna@taskflow.dev` | Member — works tasks |

### 8. Run the tests

```bash
cd backend
npm test
```

At the time of writing, TaskFlow has **197 passing tests across 19 suites**.
Several chapters refer to specific tests — run them as you read.

---

## Conventions in this book

**Code blocks** — shown with the real file path:

```ts
// backend/src/main.ts
import { NestFactory } from '@nestjs/core';
```

**Terminal blocks** — commands to run, shown with `$`:

```bash
$ curl http://localhost:3001/api/health
```

**📌 In the TaskFlow repo** — points you to the exact file for a concept.

**⚠️ Common mistake** — the failing pattern, then the fix.

**❓ Interview question** — inline where a concept is a classic interview topic.

**Exercises** — at the end of each chapter, four levels:
- 🟢 **Concept** — check your mental model.
- 🟡 **Code** — write or modify real TaskFlow code.
- 🔴 **Debug** — find the bug in a given snippet.
- ⚫ **Mini-project** — build something small with what you learned.

---

## What you will be able to do after Volume I

- Trace any HTTP request in TaskFlow from browser to database and back.
- Explain how Node.js actually executes your code — event loop, promises,
  microtasks, streams — and why it matters for a web server.
- Write professional TypeScript: generics, utility types, `keyof`, `infer`,
  conditional types — used the way TaskFlow uses them.
- Explain NestJS's request lifecycle, dependency injection, and every decorator
  in the codebase.
- Design MongoDB collections, indexes, and queries that stay fast at scale.
- Implement JWT authentication and RBAC authorization and defend your design.
- Architect with events, repositories, and clean seams — and explain the
  *evolution* of an architecture, not just its final state.
- Write honest tests at the unit, integration, and e2e levels.
- Harden, log, containerize, deploy, and scale a backend.

That is the promise of this book. Let's begin.

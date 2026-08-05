# Building Production-Ready Web Applications with TaskFlow

**Volume I — Backend Foundations**

> A real software engineering book — not a course, not notes, not a roadmap.
> Every concept is explained from first principles and then demonstrated with
> **your** TaskFlow project, the only example in the book.
>
> Target length: **450–600 pages**.

---

## How this book is built

Every chapter follows a fixed publisher-grade template:

1. **Opening scenario** — the question the chapter answers, framed as a real situation.
2. **Learning objectives** — what you can *do* after the chapter.
3. **First-principles explanations** — the idea, built from zero, visually.
4. **"In the TaskFlow repo"** — the exact files and lines that implement it.
5. **Why this design?** — the tradeoffs and the decisions behind them.
6. **Common mistakes** — the traps, with the failing code.
7. **Refactoring examples** — bad → good, in the same codebase.
8. **Exercises** — concept, code, debug, and mini-project levels.
9. **Interview questions** — asked the way a real interviewer asks them.
10. **Key takeaways** — the three to five things to remember forever.

---

## Master Table of Contents

### Part I — Foundations
| # | Chapter | Est. pages | Status |
|---|---------|-----------|--------|
| 1 | [What Happens When You Visit a Website?](./01-ch01-what-happens-when-you-visit-a-website.md) | ~50 | ✅ written |
| 2 | Node.js from First Principles | ~70 | ✅ written |
| 3 | TypeScript Like a Professional | ~75 | ✅ written |

### Part II — NestJS
| # | Chapter | Est. pages | Status |
|---|---------|-----------|--------|
| 4 | Why NestJS Exists (MVC, layers, DI, modules, providers) | ~45 | ✅ written |
| 5 | Request Lifecycle — one `POST /tasks`, every function, every decorator | ~55 | ✅ written |
| 6 | Dependency Injection (container, resolution, scopes, circular deps) | ~45 | ⬜ planned |
| 7 | Controllers — every decorator explained | ~40 | ⬜ planned |
| 8 | Services — good vs. bad business logic, service boundaries | ~40 | ⬜ planned |
| 9 | Repositories — the pattern, the stable seam, `refId()`, the bug and the fix | ~55 | ⬜ planned |

### Part III — MongoDB
| # | Chapter | Est. pages | Status |
|---|---------|-----------|--------|
| 10 | MongoDB — collections, documents, indexes, ObjectId, aggregation, transactions | ~50 | ⬜ planned |
| 11 | Mongoose — schemas, models, statics, middleware, virtuals, populate, lean | ~50 | ⬜ planned |
| 12 | Database Design — every TaskFlow collection, normalization vs. denormalization | ~45 | ⬜ planned |

### Part IV — Authentication
| # | Chapter | Est. pages | Status |
|---|---------|-----------|--------|
| 13 | JWT — token structure, claims, signing, verification, expiration, refresh, replay | ~45 | ⬜ planned |
| 14 | Authentication in TaskFlow — login trace, JwtStrategy, Passport, CurrentUser | ~45 | ⬜ planned |
| 15 | Authorization — RBAC, ownership, visibility, `VisibilityPolicyService`, `ProjectMemberGuard` | ~45 | ⬜ planned |

### Part V — Architecture
| # | Chapter | Est. pages | Status |
|---|---------|-----------|--------|
| 16 | Clean Architecture — entities, use cases, repositories, frameworks vs. TaskFlow | ~40 | ⬜ planned |
| 17 | SOLID — every principle, real TaskFlow examples and refactorings | ~40 | ⬜ planned |
| 18 | Event-Driven Architecture — typed events, the notification pipeline, compile-time safety | ~45 | ⬜ planned |
| 19 | Architecture Evolution — the real before/after case study of Candidates 1–3 | ~45 | ⬜ planned |

### Part VI — Notifications
| # | Chapter | Est. pages | Status |
|---|---------|-----------|--------|
| 20 | Building Notifications — comment/assignment/status/reply alerts, unread, read, deep links, sender | ~50 | ⬜ planned |
| 21 | Background Jobs — cron, deadline alerts, retries, queues, BullMQ, future evolution | ~40 | ⬜ planned |

### Part VII — Testing
| # | Chapter | Est. pages | Status |
|---|---------|-----------|--------|
| 22 | Unit Testing — Jest, mocks, spies, repositories, controllers, services | ~40 | ⬜ planned |
| 23 | Integration Testing — APIs, Mongo, notifications, auth | ~40 | ⬜ planned |
| 24 | Writing Good Tests — the real bug, why fake mocks lied, honest tests | ~35 | ⬜ planned |

### Part VIII — Production
| # | Chapter | Est. pages | Status |
|---|---------|-----------|--------|
| 25 | Security — OWASP, JWT attacks, injection, validation, rate limiting, Helmet, CORS | ~45 | ⬜ planned |
| 26 | Performance — indexes, caching, Redis, pagination, projection, lean | ~40 | ⬜ planned |
| 27 | Logging — logger, tracing, correlation IDs, audit trails | ~30 | ⬜ planned |
| 28 | Docker — Dockerfile, Compose, images, volumes, deploy TaskFlow | ~35 | ⬜ planned |
| 29 | CI/CD — GitHub Actions, testing, deployment, versioning | ~30 | ⬜ planned |
| 30 | Scaling — horizontal, vertical, microservices, queues, event buses | ~35 | ⬜ planned |

### Appendices
| File | Content |
|------|---------|
| `appendix-http-status.md` | HTTP status codes cheat sheet |
| `appendix-mongo-operators.md` | MongoDB operators reference |
| `appendix-nestjs-decorators.md` | NestJS decorator reference |
| `appendix-typescript-cheat-sheet.md` | TypeScript cheat sheet |
| `appendix-git-cheat-sheet.md` | Git cheat sheet |
| `appendix-linux-commands.md` | Linux command reference |
| `appendix-docker-commands.md` | Docker command reference |
| `appendix-architecture-patterns.md` | Architecture pattern catalog |
| `appendix-interview-questions.md` | Common backend interview questions |
| `appendix-100-exercises.md` | 100 backend exercises |
| `appendix-taskflow-code-index.md` | TaskFlow code index — file → concept map |

---

## Conventions used throughout

- **Code blocks** are real files from the TaskFlow repo (paths shown above each block).
- **`terminal` blocks** are actual commands you can run.
- **📌 In the TaskFlow repo** callouts point to the exact file implementing a concept.
- **⚠️ Common mistake** callouts show the failing pattern first, then the fix.
- **❓ Interview question** callouts appear inline where a concept is a classic question.

## Companion code

The entire book is built against the repository this file lives in.
Run `git log` from `taskflow/` to see the real history — Chapters 9, 18, 19, and 24
are case studies of commits that actually happened.

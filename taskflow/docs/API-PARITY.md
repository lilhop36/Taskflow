# API ↔ UI Parity Document (Living)

> **What this is:** A single source of truth mapping every backend REST route to its
> frontend consumer (or documenting why it is intentionally API-only). Keeping this
> table current is part of the Definition of Done for every sprint that touches
> either side of the stack.
>
> **Last audit:** 2026-08-03 · **Auditor:** Buffy (code-searcher extraction + live browser verification)
> **Status:** 32/36 routes verified in UI · 3 API-only by design · 1 infra-only · 0 gaps

---

## How to keep this document alive (READ THIS FIRST)

When you add, remove, or change a backend route **or** a frontend API call, update this
file in the **same PR/commit** that changes the code:

1. **Backend:** add/remove rows in the [Route Parity Table](#route-parity-table). If the
   route is exposed to the UI, the *Frontend consumer* column must name the exact file
   (and line, if practical). If it is deliberately API-only, mark it `API-only (reason)`.
2. **Frontend:** when you wire an existing route to a UI control, flip its status to
   `✅ verified in UI` and add a row to the [Verified-in-UI checklist](#verified-in-ui-checklist).
3. **Never mark a route `✅ verified in UI` without clicking it once** — automated
   extraction proves the call exists, not that it works.
4. **Re-run the audit** at the end of each sprint using the commands in
   [Re-auditing in 60 seconds](#re-auditing-in-60-seconds) and update the *Last audit* line
   with the date and the new score.

### Status legend

| Status | Meaning |
|---|---|
| ✅ verified in UI | Route called from the frontend **and** clicked successfully in the browser |
| ⚠️ wired, not verified | Frontend calls the route but it has not been exercised in-browser recently |
| 🔒 API-only | Deliberately no UI consumer (reason given) — usually low-value lookups |
| ❌ gap | Route has no UI consumer and no good reason — should be wired or removed |
| 🏥 infra | Ops/monitoring endpoint, never meant for UI |

---

## Route Parity Table

All paths are relative to the API base `http://localhost:3001/api`.

### Auth (`auth/auth.controller.ts`)

| Method | Path | Roles | Frontend consumer | Status |
|---|---|---|---|---|
| POST | `/auth/login` | Public (`@Public()`) | `app/login/page.tsx` → `contexts/AuthContext.tsx` (`login()`) | ✅ verified in UI |
| GET | `/auth/session` | any authed (`@CurrentUser()`, no `@Public`) | `contexts/AuthContext.tsx` (session restore on mount) | ✅ verified in UI |
| POST | `/auth/refresh` | Public (`@Public()`) | `lib/api.ts` (401-retry interceptor, silent rotation) | ✅ verified in UI |
| POST | `/auth/logout` | Public (`@Public()`) | `components/AppShell.tsx` / `contexts/AuthContext.tsx` (`logout()`) | ✅ verified in UI |

### Users (`users/users.controller.ts`)

| Method | Path | Roles | Frontend consumer | Status |
|---|---|---|---|---|
| POST | `/users` | Admin | `app/users/page.tsx` (create-user form) | ✅ verified in UI |
| GET | `/users` | PM+ | `app/users/page.tsx`, `app/teams/page.tsx` (member picker), `app/reports/page.tsx` (employee picker), `app/projects/new/page.tsx` (PM picker) | ✅ verified in UI |
| GET | `/users/:id` | PM+ | — | 🔒 API-only (UI reads all fields from `GET /users`) |
| PATCH | `/users/:id` | Admin | — | 🔒 API-only (no edit-user form; create + deactivate cover the UI needs) |
| PATCH | `/users/:id/deactivate` | Admin | `app/users/page.tsx` (Deactivate button) | ✅ verified in UI |

### Teams (`teams/teams.controller.ts`)

| Method | Path | Roles | Frontend consumer | Status |
|---|---|---|---|---|
| POST | `/teams` | Admin | `app/teams/page.tsx` (create-team form) | ✅ verified in UI |
| GET | `/teams` | any authed | `app/teams/page.tsx`, `app/projects/[id]/page.tsx` (add-team picker) | ✅ verified in UI |
| GET | `/teams/:id` | any authed | — | 🔒 API-only (list already returns full team incl. populated members) |
| PATCH | `/teams/:id` | Admin | `app/teams/page.tsx` (inline edit form) | ✅ verified in UI |
| DELETE | `/teams/:id` | Admin | `app/teams/page.tsx` (Delete button) | ✅ verified in UI |
| POST | `/teams/:id/members` | Admin | `app/teams/page.tsx` (+ Add member picker) | ✅ verified in UI |
| DELETE | `/teams/:id/members/:userId` | Admin | `app/teams/page.tsx` (per-member Remove button) | ✅ verified in UI |

### Projects (`projects/projects.controller.ts`)

| Method | Path | Roles | Frontend consumer | Status |
|---|---|---|---|---|
| POST | `/projects` | PM, Admin | `app/projects/new/page.tsx` | ✅ verified in UI |
| GET | `/projects` | TeamMember+ | `app/projects/page.tsx`, `app/dashboard/page.tsx`, `app/reports/page.tsx`, `app/tasks/new/page.tsx` | ✅ verified in UI |
| GET | `/projects/:id` | TeamMember+ | `app/projects/[id]/page.tsx` | ✅ verified in UI |
| PATCH | `/projects/:id` | PM, Admin | `app/projects/[id]/page.tsx` (add team) | ✅ verified in UI |
| PATCH | `/projects/:id/archive` | PM, Admin | `app/projects/[id]/page.tsx` (Archive project button, BR-003 guarded) | ✅ verified in UI |

### Tasks (`tasks/tasks.controller.ts`)

| Method | Path | Roles | Frontend consumer | Status |
|---|---|---|---|---|
| POST | `/tasks` | PM, Admin | `app/tasks/new/page.tsx` (assignment form) | ✅ verified in UI |
| GET | `/tasks` | TeamMember+ | `app/tasks/page.tsx`, `app/dashboard/page.tsx`, `app/projects/page.tsx` | ✅ verified in UI |
| GET | `/tasks?project=` | TeamMember+ | `app/projects/[id]/page.tsx` | ✅ verified in UI |
| GET | `/tasks?assignee=` | TeamMember+ | — (dashboard uses in-memory filtering) | ⚠️ wired, not verified |
| GET | `/tasks/:id` | TeamMember+ | `app/tasks/[id]/page.tsx` | ✅ verified in UI |
| PATCH | `/tasks/:id` | PM, Admin | `app/tasks/[id]/page.tsx` (Assign to… dropdown) | ✅ verified in UI |
| PATCH | `/tasks/:id/status` | TeamMember+ | `app/tasks/[id]/page.tsx` (Move to… buttons) | ✅ verified in UI |

### Comments (`comments/comments.controller.ts` — nested under tasks)

| Method | Path | Roles | Frontend consumer | Status |
|---|---|---|---|---|
| POST | `/tasks/:taskId/comments` | Project member (`ProjectMemberGuard`) | `app/tasks/[id]/page.tsx` (comment form) | ✅ verified in UI |
| GET | `/tasks/:taskId/comments` | Project member | `app/tasks/[id]/page.tsx` (thread) | ✅ verified in UI |
| PATCH | `/tasks/:taskId/comments/:commentId` | Project member | `app/tasks/[id]/page.tsx` (Edit button, BR-005 history) | ✅ verified in UI |
| DELETE | `/tasks/:taskId/comments/:commentId` | Project member | `app/tasks/[id]/page.tsx` (Delete button, soft delete) | ✅ verified in UI |

### Notifications (`notifications/notifications.controller.ts`)

| Method | Path | Roles | Frontend consumer | Status |
|---|---|---|---|---|
| GET | `/notifications` | any authed (own only) | `app/notifications/page.tsx` | ✅ verified in UI |
| PATCH | `/notifications/:id/read` | any authed (own only) | `app/notifications/page.tsx` (dismiss one) | ✅ verified in UI |
| PATCH | `/notifications/read-all` | any authed (own only) | `app/notifications/page.tsx` (clear all) | ✅ verified in UI |

### Reports (`reports/reports.controller.ts`)

| Method | Path | Roles | Frontend consumer | Status |
|---|---|---|---|---|
| GET | `/reports/project/:projectId` | PM, Admin | `app/reports/page.tsx` | ✅ verified in UI |
| GET | `/reports/employee/:userId` | PM, Admin | `app/reports/page.tsx` | ✅ verified in UI |

### Health (`health/health.controller.ts`)

| Method | Path | Roles | Frontend consumer | Status |
|---|---|---|---|---|
| GET | `/health` | Public | — (uptime/ops) | 🏥 infra |

---

## Verified-in-UI checklist

Updated 2026-08-03. Each row = one live browser session that clicked the control end-to-end
(authenticated as the right role, against a running backend).

- [x] Login / logout / session restore — signed in as Priya (PM) and Ada (Admin)
- [x] Create task — `/tasks/new` form → task detail page → `task.assigned` notification for Tom
- [x] Reassign task — "Assign to…" dropdown Tom → Jerry → `TaskAssigned` notification for Jerry
- [x] Status transition — Move to In Progress on task detail
- [x] Comment create / edit / delete — posted, edited ("(edited)" marker), soft-deleted (thread → 0, `deletedAt`/`deletedBy`/`editHistory` written)
- [x] Create project — `/projects/new` form → project detail page
- [x] Add team to project — project detail "Add team…" picker
- [x] Archive project — rejected on active tasks (BR-003 message inline), succeeded on empty project (status → Archived)
- [x] Create team — `/teams` "New Team" form
- [x] Edit team — inline rename/description (persisted via `PATCH /teams/:id`)
- [x] Delete team — confirm → row gone (404 after)
- [x] Add member to team — "+ Add member…" picker
- [x] Remove member from team — per-member "Remove" (hover) button
- [x] Create user / deactivate user — users page (Admin)
- [x] Notifications — list, mark-one-read, read-all
- [x] Reports — project + employee generation (PM)

**Not yet browser-verified (wired):**
- [ ] `GET /tasks?assignee=` — endpoint works via API; UI never sends the param today

---

## Re-auditing in 60 seconds

Extract both sides and diff them (run from the repo root):

```bash
# Every backend route
grep -rn "@\(Get\|Post\|Patch\|Put\|Delete\)(" taskflow/backend/src --include="*.controller.ts"

# Every frontend API call
grep -rn "api\.\(get\|post\|patch\|put\|delete\)(" taskflow/frontend --include="*.ts" --include="*.tsx"

# Role guards per controller (to re-check the Roles column)
grep -rn "@Roles\|@Public" taskflow/backend/src --include="*.controller.ts"
```

Then walk the new/changed rows in the browser (one click per route) and update this file.
Never trust extraction alone — a call that exists is not a control that works.

---

## Score history

| Date | Verified | API-only | Infra | Gaps |
|---|---|---|---|---|
| 2026-08-03 (initial audit) | 27 | 8 | 1 | 6 (create project/task, reassign, archive, comment edit/delete, team member removal, team edit/delete) |
| 2026-08-03 (after UI work) | 32 | 3 | 1 | 0 |

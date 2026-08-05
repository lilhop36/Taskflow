# Chapter 4 — Why NestJS Exists

> **Opening scenario.** A new developer joins the team and is handed the
> TaskFlow codebase. Thirty minutes in, they have found the login route, the
> user list route, and the task creation route. They search for
> "createTask" and find *four* files: a controller method, a service method, a
> repository method, and a schema. "Why not just put it all in one file?"
> they ask. "It's four files to do one thing."
>
> The answer to that question is the entire subject of this chapter — and it
> is the most important architectural lesson in this book. Four files do one
> thing *well*. The one-file version works for a weekend project and becomes
> unmaintainable at the scale where production bugs live. NestJS exists to
> make the four-file version the *default*, so you never have to invent
> structure under pressure.

In Chapters 1–3 you met the network, the runtime, and the language. Now we
meet the **framework** — NestJS — and more importantly, the *ideas* it is
built on. By the end of this chapter you will understand why NestJS is shaped
the way it is, because you will have seen the problems it solves: unstructured
servers, tangled dependencies, and the slow death of a codebase that had no
architecture.

**Learning objectives.** By the end of this chapter you will be able to:

- explain what MVC is and how TaskFlow maps onto it;
- name the layers of a NestJS application and what each layer is *for*;
- read a module file and explain what `imports`, `controllers`, `providers`,
  and `exports` do;
- explain dependency injection in plain terms and point at the container in
  TaskFlow;
- trace the controller → service → repository flow for any TaskFlow feature;
- explain why the guards are global and what "secure by default" means;
- and defend the layered architecture against the "why not one file?"
  question — with the real consequences of each choice.

---

## 4.1 The problem NestJS solves

Before NestJS (and before the architecture it popularized), a Node.js server
was often written like this — one file, everything in it:

```js
// The "one file" server — every Node developer has written this
const express = require('express');
const app = express();

app.post('/tasks', async (req, res) => {
  // 1. parse the body
  const { title, description, project, assignee, dueDate } = req.body;

  // 2. validate
  if (!title) return res.status(400).json({ message: 'Title is required' });

  // 3. check the database
  const db = await getDb();
  const project = await db.collection('projects').findOne({ _id: project });
  if (!project) return res.status(404).json({ message: 'Project not found' });

  // 4. check membership
  const members = [project.owner, ...(project.members || [])];
  if (!members.some((m) => m.toString() === assignee)) {
    return res.status(400).json({ message: 'Assignee must be a member' });
  }

  // 5. insert
  const result = await db.collection('tasks').insertOne({ ... });

  // 6. notify
  await db.collection('notifications').insertOne({ ... });

  // 7. respond
  res.status(201).json(result);
});
```

This works. And it fails you slowly, in seven specific ways:

1. **No separation** — validation, business rules, database access, and
   side effects share one function. Changing any one risks the others.
2. **No testability** — to test "assignee must be a member," you must fake a
   database, an HTTP request, and a response. The test is an integration test
   by accident.
3. **No reuse** — the "is this user a member" check is copy-pasted into the
   project, comment, and report routes, each with slight drift.
4. **No enforcement** — nothing stops a future developer from skipping a
   step, or reordering them, or adding an 8th step that violates a rule.
5. **No security by default** — auth is bolted on per-route, and one forgotten
   route is one open hole.
6. **No structure for growth** — 10 features like this becomes 10 files of
   800 lines each, and nobody can say where anything lives.
7. **The team scales worse than the code** — every new developer must read
   *everything* to change *anything*.

NestJS exists to make the alternative the default: a **layered architecture**
with **dependency injection**, organized into **modules**, where every concern
has a home and every dependency is declared.

---

## 4.2 MVC — the granddaddy of the idea

NestJS's structure descends from **MVC (Model–View–Controller)**, the
architecture that has organized web applications since the 1970s (Smalltalk)
and through Rails, Django, and Spring. Three roles:

```
┌────────────────────────────────────────────────────────┐
│                     MVC (classic)                      │
│                                                        │
│   ┌─────────────┐      ┌──────────────┐                │
│   │ Controller  │ ───▶ │   Service    │                │
│   │  (input)    │      │ (logic)      │                │
│   └─────────────┘      └──────┬───────┘                │
│         ▲                     │                        │
│         │                     ▼                        │
│   ┌─────────────┐      ┌──────────────┐                │
│   │   View      │      │   Model      │                │
│   │  (output)   │      │  (data)      │                │
│   └─────────────┘      └──────────────┘                │
└────────────────────────────────────────────────────────┘
```

- **Model** — the data and its rules (in TaskFlow: the Mongoose schemas).
- **View** — the presentation (in TaskFlow: the JSON responses; the React
  frontend is the ultimate View).
- **Controller** — the input handler that connects the two.

NestJS keeps the spirit and splits the roles finer. Where classic MVC has one
"Model" that does data *and* business logic, NestJS (and the layered
architecture it follows) separates:

| Classic MVC role | NestJS layer | TaskFlow example |
|------------------|--------------|------------------|
| Controller | **Controller** — parse input, call logic, shape output | `TasksController` |
| — | **Service** — business rules, orchestration | `TasksService` |
| Model | **Repository** — data access, the DB seam | `TasksRepository` |
| Model | **Schema** — the data's shape and constraints | `Task` schema |
| View | **JSON response** (and the frontend, Volume II) | controller return values |

The critical idea inherited from MVC: **each layer has one job, and layers
only talk to the layer below them.** That rule — *dependency flows downward* —
is what makes the whole structure stable. We see it enforced everywhere in
TaskFlow: a controller never touches MongoDB; a repository never parses an
HTTP body; a service never knows what a status code is.

> **❓ Interview question.** "What is MVC?" — Model (data), View
> (presentation), Controller (input routing). And for a NestJS follow-up:
> "How does NestJS extend MVC?" — it splits the Model into schema + repository
> + service so each concern is independently testable.

---

## 4.3 The layers, one by one

Let's name the layers with their real TaskFlow occupants, and — crucially —
their *boundaries*: what each layer may never do.

### The request pipeline (outermost)

```
Browser
   │
   ▼
NestJS bootstrap (main.ts)        ← CORS, cookies, global pipes, global prefix
   │
   ▼
Global guards (APP_GUARD)         ← JwtAuthGuard, RolesGuard
   │
   ▼
Route-level guards (optional)     ← ProjectMemberGuard, ProjectAccessGuard
   │
   ▼
Controller                         ← parses HTTP, delegates, shapes response
   │
   ▼
Service                            ← business rules, orchestration, events
   │
   ▼
Repository                         ← the only layer that talks to MongoDB
   │
   ▼
MongoDB
```

Each box is a *layer*. The rules:

- **Bootstrap** (`main.ts`) configures the app globally: CORS, cookie parsing,
  the validation pipe, the `/api` prefix. It never handles business logic.
- **Guards** answer "may this request proceed?" *before* the controller runs.
  They never compute business results.
- **Controllers** are *thin*. They parse the HTTP request (`@Body`, `@Param`,
  `@CurrentUser`), call one service method, and return the result. A
  controller that contains a `for` loop over business data is a code smell.
- **Services** own the *business rules*: project exists, assignee is a member,
  due date is in range, status transition is legal, notifications fire.
- **Repositories** own *data access*: every Mongoose query in TaskFlow lives
  in a repository. Services never import `Model`.

> **In the TaskFlow repo** — the repository layer documents its own rule
> (Chapter 1 quoted it; it bears repeating as the crispest statement of
> layering in the codebase):
>
> ```ts
> // backend/src/users/users.repository.ts (real)
> // The Repository Pattern: this class is the only place in the codebase
> // that talks directly to the MongoDB users collection.
> // Services never import Model or call Mongoose methods directly —
> // they call this repository instead.
> ```

### The single-direction rule

The one rule that keeps the layers from rotting:

> **Each layer may only depend on the layer directly below it. Dependencies
> never flow upward, and never skip a layer.**

- Controller → Service ✅
- Service → Repository ✅
- Repository → MongoDB ✅
- Controller → Repository ❌ (skips the business layer)
- Service → MongoDB directly ❌ (skips the repository seam)
- Controller → HTTP-response-shaping inside a loop ❌ (business work in the
  wrong layer)

When you see this rule violated, you are looking at a future bug: either the
business rule gets skipped (the "skip a layer" case) or two places now encode
the same rule and drift apart (the "duplicate" case). Chapter 19's case study
— the visibility rule being re-derived in five places before being centralized
— is exactly the drift this rule prevents.

> **Why this design?** The single-direction rule buys **locality**: when
> something is wrong with task *creation*, you know it is in
> `TasksService.create` — not "somewhere in the tasks feature." It buys
> **testability**: each layer can be tested against a fake of the layer below
> (Chapter 22). And it buys **replaceability**: swap MongoDB for Postgres by
> rewriting only the repositories (Chapter 9).

---

## 4.4 Modules — the boundaries of the codebase

A **module** is NestJS's unit of organization: a class with a `@Module()`
decorator that declares what it contains and what it needs. Each TaskFlow
feature is one module. Here is the real `UsersModule` — the smallest complete
example:

```ts
// backend/src/users/users.module.ts (real)
@Module({
  imports: [MongooseModule.forFeature([{ name: User.name, schema: UserSchema }])],
  controllers: [UsersController],
  providers: [UsersService, UsersRepository],
  exports: [UsersService, UsersRepository],
})
export class UsersModule {}
```

Four declarative arrays, four questions answered:

| Field | Answer | In UsersModule |
|-------|--------|----------------|
| `imports` | What other modules' *exports* do I need? | The Mongoose model registration for `User` |
| `controllers` | Which HTTP routes belong to this feature? | `UsersController` |
| `providers` | What services/repositories do I provide to the container? | `UsersService`, `UsersRepository` |
| `exports` | Which of my providers may *other* modules use? | Both — auth needs the service; tasks need both |

The `exports` array is the security boundary of the module system: **a
provider is visible to other modules only if this module exports it.** The
`UsersRepository` is exported because TasksService needs to check membership;
the `UsersController` is, of course, not — controllers are endpoints, not
dependencies.

### The real module tree

Every TaskFlow feature module, and what it imports:

```
AppModule (composition root)
├── ConfigModule.forRoot          — env vars, global
├── EventEmitterModule.forRoot()  — the event system, global
├── DatabaseModule                — Mongo connection (forRootAsync)
├── UsersModule
│     └── MongooseModule.forFeature([User])
├── ProjectsModule
│     ├── UsersModule              — owner role checks (BR-008)
│     └── MongooseModule.forFeature([Project, Task])  — archive task-count guard
├── TasksModule
│     ├── ScheduleModule.forRoot()   — cron
│     ├── ProjectsModule             — for membership checks
│     ├── UsersModule                — for assignee checks
│     └── MongooseModule.forFeature([Task])
├── CommentsModule
│     ├── TasksModule                — to verify the task exists
│     ├── ProjectsModule             — ProjectMemberGuard's visibility policy
│     └── MongooseModule.forFeature([Comment])
├── NotificationsModule
│     └── MongooseModule.forFeature([Notification])
├── ReportsModule
├── TeamsModule
│     └── MongooseModule.forFeature([Team])
├── AuthModule
│     ├── UsersModule
│     ├── PassportModule
│     └── JwtModule
└── HealthModule
```

Two patterns jump out — and both are deliberate:

1. **`MongooseModule.forFeature([...])` is per-feature, not global.** Each
   module registers *its own* models locally. This is the module boundary in
   action: TasksModule declares "I own the Task model"; nothing else can
   casually inject it.
2. **Modules import each other for *services*, not for database access.**
   `TasksModule` imports `ProjectsModule` to call
   `ProjectsRepository.findById` — a *service-level* dependency, not a
   "connect to the projects collection" dependency. Cross-feature access goes
   through the exported seam.

> **In the TaskFlow repo** — the real `TasksModule`:
>
> ```ts
> // backend/src/tasks/tasks.module.ts (real)
> @Module({
>   imports: [
>     ScheduleModule.forRoot(),
>     ProjectsModule,
>     UsersModule,
>     MongooseModule.forFeature([{ name: Task.name, schema: TaskSchema }]),
>   ],
>   controllers: [TasksController],
>   providers: [TasksService, TasksRepository, DeadlineUrgentCron],
>   exports: [TasksService, TasksRepository],
> })
> export class TasksModule {}
> ```
>
> Note `DeadlineUrgentCron` is a provider here — the cron is part of the
> tasks feature and gets dependency-injected like any other provider. The
> scheduler it uses (`ScheduleModule.forRoot()`) is imported at the feature
> level, scoping the cron machinery to where it's used.

---

## 4.5 Providers and dependency injection

A **provider** is any class NestJS can construct and hand to other classes.
Services and repositories are providers. So are the cron, the guards, the
strategy, and the exception filter. The `@Injectable()` decorator marks a
class as a provider:

```ts
// backend/src/common/guards/roles.guard.ts (real)
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  // ...
}
```

### Dependency injection, in plain terms

**Dependency injection (DI)** means: a class never *creates* the things it
needs; it *declares* them and receives them. `TasksService` needs a
repository, a users service, a projects repository, a visibility policy, and
an event emitter. It does not `new` any of them:

```ts
// backend/src/tasks/tasks.service.ts (real)
constructor(
  private readonly tasksRepository: TasksRepository,
  private readonly projectsRepository: ProjectsRepository,
  private readonly usersService: UsersService,
  private readonly visibilityPolicy: VisibilityPolicyService,
  private readonly eventEmitter: EventEmitter2,
) {}
```

Who creates them? The **container** — NestJS's runtime dependency graph. At
boot, Nest walks every provider, reads each constructor's parameter types
(the `emitDecoratorMetadata` setting from Chapter 3 §3.11 is what makes the
types readable at runtime), and constructs the graph: "TasksService needs a
TasksRepository → construct one → TasksRepository needs a Model<TaskDocument>
→ get it from the registered Mongoose model."

```
Container (at boot)
┌──────────────────────────────────────────────┐
│ TasksService                                │
│   ├── TasksRepository ── Model<Task> ─┐     │
│   ├── ProjectsRepository ── Model<Project> │
│   ├── UsersService ── UsersRepository ─┐   │
│   ├── VisibilityPolicyService ──┐          │
│   └── EventEmitter2 (global)     │          │
└──────────────────────────────────┴──────────┘
```

### Three properties that fall out of DI

1. **Singletons by default.** The container creates one `TasksRepository` and
   shares it with every consumer. No duplicate connections, no state drift
   between copies.
2. **Declared dependencies.** You can see everything a service needs from its
   constructor — the "requirements list" of the class.
3. **Testability.** A test replaces any provider with a fake:
   ```ts
   // The pattern used across TaskFlow's 197 tests (Chapter 22)
   const module = await Test.createTestingModule({
     providers: [
       TasksService,
       { provide: TasksRepository, useValue: fakeRepository },
     ],
   }).compile();
   ```
   Because `TasksService` *receives* its repository, the test can hand it a
   fake — no database required.

> **Why this design?** DI is the difference between "a codebase where you can
> test any unit in isolation" and "a codebase where testing means booting
> everything." TaskFlow's tests inject fakes at exactly the seams DI creates —
> which is why the repository seam (Chapter 9) and the event seam (Chapter
> 18) are the book's recurring stars. DI is what makes seams *exist*.

### Circular dependencies — the tax on messy graphs

If `A` needs `B` and `B` needs `A`, the container cannot construct either.
NestJS fails at boot with `Nest can't resolve dependencies of A (B, ...)`.
TaskFlow avoids the problem structurally: **events instead of imports.** The
comments module does *not* import the notifications module; it emits a
`CommentCreatedEvent` and the notifications listener reacts. That decoupling
(Chapter 18) is the textbook answer to the circular-dependency question: don't
wire a cycle; break it with an event.

> **❓ Interview question.** "How do you handle circular dependencies in
> NestJS?" — Ideally you restructure to remove them (events, or extracting a
> shared module). NestJS also offers `forwardRef()` for the cases you can't
> restructure, but that's a bridge, not a design.

---

## 4.6 The composition root — `AppModule`

Every module graph has one root. In TaskFlow it's `AppModule` — the
**composition root**, the single place where the whole application is wired
together. We saw it in Chapter 1's map and Chapter 2's unmasking; now read it
as the architectural statement it is:

```ts
// backend/src/app.module.ts (real, abridged to the structure)
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env', load: [jwtConfig], … }),
    EventEmitterModule.forRoot(),
    DatabaseModule,
    UsersModule,
    ProjectsModule,
    TasksModule,
    CommentsModule,
    NotificationsModule,
    ReportsModule,
    TeamsModule,
    AuthModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
```

Three architectural decisions live in this file:

1. **The feature list is the app.** Reading `imports` top to bottom is reading
   the product: config, events, database, users, projects, tasks, comments,
   notifications, reports, teams, auth, health. Each is a bounded feature.
2. **`APP_GUARD` registers guards globally.** `JwtAuthGuard` and `RolesGuard`
   run on *every* request — that's the "secure by default" stance from
   Chapter 1: a new route is protected until the developer explicitly relaxes
   it with `@Public()` or `@Roles()`. Forgetting to add auth is impossible;
   forgetting to *remove* it is the only option.
3. **`APP_FILTER` registers the exception filter globally** — every thrown
   error funnels through one place that maps it to a clean HTTP response
   (Chapter 9).

> **Why this design?** The composition root pattern says: *all wiring happens
> in one place, and nothing else wires anything.* No service constructs its
> own dependencies; no controller reaches for a global; every edge in the
> dependency graph is declared in `AppModule` (for globals) or the feature
> modules (for locals). When something is wired wrong, there is exactly one
> file to read.

---

## 4.7 The guard chain — where authorization lives

TaskFlow runs **three guards** at two scopes. Understanding the chain is
understanding the security model (Chapters 14–15 go deep; here is the map):

```
Every request
   │
   ▼
JwtAuthGuard (global)     — "Is there a valid JWT? Attach the user."
   │  not authenticated → 401
   ▼
RolesGuard (global)       — "Is the user's role allowed for this route?"
   │  wrong role → 403
   ▼
ProjectMemberGuard        — (route-level, only on some routes)
   │                      — "Is the user a member of this project?"
   │  not a member → 403
   ▼
Controller
```

- **JwtAuthGuard** runs everywhere, extracts the token (from cookie or
  `Authorization` header), verifies it, and attaches the user to the request
  (Chapter 14).
- **RolesGuard** runs everywhere, reads the route's `@Roles(...)` metadata,
  and checks the user's role (Chapter 15).
- **ProjectMemberGuard** runs *only on routes annotated with
  `@UseGuards(ProjectMemberGuard)`* — the per-resource ownership/membership
  check. In Chapter 1 we saw it on `GET /api/tasks/:id`; it also guards the
  comments controller's class:

```ts
// backend/src/comments/comments.controller.ts (real)
@Controller('tasks/:taskId/comments')
@UseGuards(ProjectMemberGuard)
export class CommentsController { … }
```

Class-level means *every* comment route inherits the guard — one declaration,
all four comment endpoints protected.

The layering principle at work again: global guards answer "who are you and
what role do you have"; route guards answer "do you have a relationship to
*this specific resource*." Different questions, different scopes, cleanly
separated.

---

## 4.8 One feature, end to end — the canonical picture

Let's assemble everything with the feature that will dominate Part II:
tasks. Every piece we've discussed is visible in one flow:

```
POST /api/tasks
   │
   ▼
JwtAuthGuard (global)          → user attached to request
   ▼
RolesGuard (global)            → @Roles(PM, ADMIN) on TasksController class
   ▼
ValidationPipe (global)        → body validated against CreateTaskDto (400 if bad)
   ▼
TasksController.create         → thin: parse @Body + @CurrentUser, delegate
   ▼
TasksService.create            → business rules:
   │                              • project exists (ProjectsRepository.findById)
   │                              • assignee is a member (UsersService + memberIds)
   │                              • due date within project dates
   │                              • construct task, persist (TasksRepository.create)
   │                              • emit TaskAssignedEvent
   ▼
TasksRepository.create         → new this.taskModel(data).save()
   ▼
MongoDB                        → document inserted
   ▼
(back up) TasksService returns task.toObject()
   ▼
TasksController returns it     → 201 Created + JSON
```

Every arrow crosses exactly one layer boundary. Every layer has one job. This
picture — the same flow you traced by hand in Chapter 1 — is what NestJS
exists to make *the default way of writing servers*.

> **Why this design?** Count the ways this specific arrangement protects you:
> the guards make the route safe by default; the pipe rejects malformed input
> before any logic runs; the service owns the business rules in one testable
> place; the repository owns the query in one replaceable place; the event
> decouples the side effect. A "one file" server can provide *none* of these
> guarantees. That is the entire argument for NestJS — and it is an argument
> about *where code lives*, not about syntax.

---

## 4.9 Common mistakes

**1. Fat controllers.** A controller that validates, computes, queries, and
shapes response data is a one-file server wearing a costume. Controllers
should be a thin handoff: parse → delegate → return.

**2. Services touching MongoDB directly.** Importing `Model` into a service
skips the repository seam. The rule in TaskFlow's own comments: services
never import Model.

**3. Repositories knowing about HTTP.** A repository method that takes a
`Request` object, or returns a status code, has crossed a layer boundary.
Repositories speak in ids and domain objects.

**4. Exporting everything.** `exports` is a boundary. Exporting the repository
*and* the service *and* a helper *and* a schema invites other modules to reach
into the feature's guts. Export the minimum other modules need.

**5. Using `forwardRef()` as a first resort.** Circular dependencies are
usually a smell that two modules are too entangled. Break the cycle with an
event or a shared module before reaching for `forwardRef`.

**6. Not using the composition root.** Registering a global guard or filter
inside a feature module makes the app's security model invisible. Globals
belong in `AppModule` where a new developer can find them in one place.

---

## Exercises

### 🟢 Concept

1. Name the four arrays of a `@Module()` decorator and, in one phrase each,
   what they declare.
2. State the single-direction rule for layers, and give one violation example
   each for "skip a layer" and "duplicate the rule."
3. What problem does dependency injection solve, in one sentence?
4. Why are `JwtAuthGuard` and `RolesGuard` registered as `APP_GUARD` in
   `AppModule` instead of per-route? What failure mode does that prevent?
5. In `backend/src/users/users.module.ts`, why is `UsersService` exported but
   `UsersController` is not?

### 🟡 Code

6. Open `backend/src/comments/comments.module.ts` (or trace it from the
   imports in `app.module.ts`). List its `imports`, `controllers`,
   `providers`, and `exports`, and explain each.
7. Draw the layer diagram for `PATCH /api/tasks/:id/status` using the real
   files: name the guard(s) that run, the controller method, the service
   method, and the repository method. Which layer enforces the transition
   rule (TODO → IN_PROGRESS)?

### 🔴 Debug

8. A teammate adds `MongooseModule.forFeature([{ name: Task.name, … }])` to
   `CommentsModule` "to fix an error," and the app now has two Task model
   registrations. Explain what the *right* fix was (check what
   `CommentsModule` imports from `TasksModule`) and why the duplicate
   registration is the wrong seam.

### ⚫ Mini-project

9. Using the TaskFlow structure as a model, sketch the four files you would
   create for a new feature — say, "AuditLog" — in the NestJS style:
   `audit-log.module.ts`, `audit-log.controller.ts`, `audit-log.service.ts`,
   `audit-log.repository.ts`. Write the `@Module()` decorator with realistic
   `imports`/`controllers`/`providers`/`exports`, and one method in each
   layer for "record an event." Do not wire it into `AppModule`; just show
   the shape.

---

## Interview questions

1. "Why NestJS over Express?" — Express is a minimal HTTP layer; NestJS adds
   structure: modules, DI, layers, guards, pipes, and testability built in.
   You can still use Express underneath (NestJS's platform).
2. "Explain the layers of a NestJS application." — Controller (HTTP in/out),
   service (business rules), repository (data access), schema (data shape),
   guards (auth), pipes (validation). Dependencies flow downward.
3. "What is a module? What are `imports`, `controllers`, `providers`,
   `exports`?" — The feature boundary; the four arrays declare dependencies,
   routes, provided classes, and the public surface.
4. "How does dependency injection work in NestJS?" — `@Injectable()` marks a
   provider; the container reads constructor parameter types at runtime
   (decorator metadata) and constructs the dependency graph at boot.
5. "What is the composition root?" — The single place where the app is wired
   (`AppModule`); globals like guards and filters are registered there.
6. "How do you test a service in NestJS?" — Create a testing module,
   override its repository with a fake via `useValue`, and exercise the
   service — the DI seams make this trivial.
7. "How do you avoid circular dependencies?" — Restructure (events, shared
   modules) before `forwardRef()`. Give TaskFlow's event-based answer.

---

## Key takeaways

1. **NestJS exists to make good architecture the default.** Modules, layers,
   DI, and declarative wiring replace the "one file" server's slow rot with
   structure that scales with the team.
2. **Four layers, one job each.** Controller parses, service decides,
   repository persists, schema defines. Dependencies flow downward, and the
   rule is enforced by convention and code review.
3. **Modules are boundaries.** `imports`/`controllers`/`providers`/`exports`
   declare what a feature contains and what it reveals — the module system is
   the codebase's firewall.
4. **DI is what makes seams exist.** Because classes receive their
   dependencies, tests can replace them, and the repository/event seams that
   run through this book are testable by construction.
5. **Globals belong in the composition root.** Guards and filters registered
   as `APP_GUARD`/`APP_FILTER` in `AppModule` make security the default and
   the security model findable in one file.

## Further reading

- [NestJS Documentation — Fundamentals](https://docs.nestjs.com/fundamentals/custom-providers) —
  modules, providers, and DI, from the framework's own docs.
- *Clean Architecture* — Robert C. Martin. The dependency-rule thinking that
  this chapter's layering descends from (we compare TaskFlow to it directly
  in Chapter 16).
- *Dependency Injection* — Mark Seemann. The definitive book on DI as a
  design principle.
- [Express documentation](https://expressjs.com/) — useful as the "control"
  in the experiment: see how far a no-structure server gets before you add
  structure back.

---

*In Chapter 5, one request makes the full journey: `POST /tasks` traced
through every function, every decorator, every file — the chapter that turns
the architecture you just learned into a map you know by heart.*

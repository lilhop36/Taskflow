# Chapter 6 — Dependency Injection

> **Opening scenario.** A junior developer is asked to add a new endpoint to
> TaskFlow. They open `TasksService` and read its constructor:
>
> ```ts
> constructor(
>   private readonly tasksRepository: TasksRepository,
>   private readonly projectsRepository: ProjectsRepository,
>   private readonly usersService: UsersService,
>   private readonly eventEmitter: EventEmitter2,
> ) {}
> ```
>
> "Where do these objects come from?" they ask. "Who calls `new
> TasksRepository()`? And how does the app *know* this is what the constructor
> wants?" Nobody in the team can quite explain it — it just works, like magic.
>
> It is not magic. It is the **dependency injection container**, and this
> chapter opens it up: what it is, how it decides what a constructor means,
> how it creates and scopes providers, and what happens when the graph goes
> wrong. By the end you will be the person who can explain it to the next
> junior — and defend every wiring decision TaskFlow makes.

Chapter 4 introduced dependency injection as one of the ideas NestJS is built
on. Chapter 5 watched the container deliver working services to every stage of
the request pipeline. Now we go inside the container itself: the resolution
algorithm, the provider catalog, scopes, and the failure modes — circular
dependencies — that reveal whether your module graph is healthy.

**Learning objectives.** By the end of this chapter you will be able to:

- explain what `emitDecoratorMetadata` has to do with DI, and how NestJS
  reads a constructor at runtime;
- distinguish class tokens from string tokens, and read any `@Inject(...)`
  in TaskFlow correctly;
- explain every custom provider in TaskFlow — `useClass`, `useFactory`,
  multi-providers like `APP_GUARD`, and async factory providers — and when to
  use each;
- trace why `TasksModule` imports `ProjectsModule` and `UsersModule`, and what
  `exports` means for visibility;
- explain the three provider scopes, name the one non-singleton provider in
  TaskFlow, and justify why TaskFlow uses no `REQUEST`-scoped providers;
- explain how TaskFlow structurally avoids circular dependencies, and why
  `forwardRef` is a last resort;
- and build a `Test.createTestingModule` that substitutes fakes for real
  providers — the skill that makes the 197 tests in Chapter 22 possible.

---

## 6.1 The problem: the `new` keyword

Before the container, there was the constructor call. A class that needs
another class creates it:

```ts
// The "manual" way — what DI eliminates
export class TasksService {
  private readonly tasksRepository = new TasksRepository();
  private readonly projectsRepository = new ProjectsRepository();
  private readonly usersService = new UsersService();
  private readonly eventEmitter = new EventEmitter2();
}
```

This compiles. It runs. And it is broken in four ways:

1. **No seams.** To test `TasksService`, you must run a real repository, a
   real database, a real event emitter. There is no place to substitute a
   fake — the wiring is baked into the class.
2. **No sharing.** Every service that `new`s a repository gets its *own* copy.
   Each copy of `UsersRepository` is fine (it's stateless) — but the day a
   provider holds state (a cache, a connection pool), copies drift apart.
3. **No configuration.** What if `TasksRepository` needs a different model in
   tests? What if the Mongo URI differs per environment? The `new` calls are
   hardcoded; there is no way to vary them without editing the class.
4. **No graph.** Constructing `TasksService` means constructing every
   transitive dependency *in the right order*, by hand. As the graph grows,
   this code rots into what dependency-injection literature calls **"the
   composition root in every class"** — wiring logic scattered everywhere.

Dependency injection inverts this: **a class declares what it needs; something
else provides it.** The class's constructor becomes a *requirements list*:

```ts
// backend/src/tasks/tasks.service.ts (real)
@Injectable()
export class TasksService {
  constructor(
    private readonly tasksRepository: TasksRepository,
    private readonly projectsRepository: ProjectsRepository,
    private readonly usersService: UsersService,
    private readonly eventEmitter: EventEmitter2,
  ) {}
```

`TasksService` no longer says *how* to build these things, only *what* it
needs. Who builds them? The **container** — and it builds them exactly once,
at boot, in the right order, sharing singletons across the whole graph.

> **Why this design?** Every benefit cascades from this one inversion:
> **testability** (replace any provider with a fake — the entire testing
> strategy of Chapter 22), **reusability** (one shared singleton instead of
> N copies), **configurability** (the environment decides what a provider
> *is*, not the class), and **order** (the container resolves the graph
> mechanically, never by hand).

---

## 6.2 The container — how NestJS reads a constructor

The container's trick is that it reads *types at runtime*. When TypeScript
compiles this constructor:

```ts
constructor(
  private readonly tasksRepository: TasksRepository,
  ...
) {}
```

it emits extra metadata — if `tsconfig.json` says so:

```json
// backend/tsconfig.json (real, relevant lines)
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

With `emitDecoratorMetadata: true`, the compiler records each constructor
parameter's type on a special property: `design:paramtypes`. Roughly, the
compiled output looks like:

```js
// what TypeScript emits (simplified)
Reflect.defineMetadata('design:paramtypes',
  [TasksRepository, ProjectsRepository, UsersService, EventEmitter2],
  TasksService);
```

So at runtime the container can ask: *"What does `TasksService` need?"* and get
back an array of **tokens** — the four classes. That is the entire resolution
mechanism. The container is a map from token → provider recipe:

```
Container (simplified)
┌──────────────────────────────────────────────────────┐
│ token              →  recipe                         │
│──────────────────────────────────────────────────────│
│ TasksRepository    →  instantiate new TasksRepository │
│                        with @InjectModel(Task.name)   │
│ ProjectsRepository →  instantiate new ProjectsRepository
│ UsersService       →  instantiate with UsersRepository│
│ EventEmitter2      →  the singleton from              │
│                        EventEmitterModule.forRoot()   │
└──────────────────────────────────────────────────────┘
```

At boot, Nest walks the module graph (Chapter 4 §4.4), collects every
provider declared in every `providers` array, and for each constructor it
reads `design:paramtypes`, looks up each token in the map, constructs the
dependencies *first*, then the dependent. If anything is missing or circular,
the app **fails at boot** — loudly, with a stack trace — rather than at
request time. That is one of DI's great properties: wiring errors are
discovered in the first five seconds of `npm run start:dev`, not by a user at
3 a.m.

> **❓ Interview question.** "How does NestJS know what to inject into a
> constructor?" — `emitDecoratorMetadata` makes TypeScript emit each
> parameter's type into `design:paramtypes`; at boot the container reads
> those tokens and resolves each against its provider map. That's also why
> a constructor parameter whose type is an *interface* fails at boot — an
> interface has no runtime value to emit (Chapter 3 §3.11).

### Why `@Injectable()`?

The `@Injectable()` decorator is what tells the container "this class is a
provider — you may construct it and hand it to others." Without it, Nest
treats the class as untrusted and refuses to inject it. Services, repositories,
guards, strategies, listeners, cron jobs — every class that appears in a
`providers` array — carries `@Injectable()`.

> **In the TaskFlow repo** — the guard you met in Chapter 4 is a provider like
> any other, and it injects Nest's `Reflector`:
>
> ```ts
> // backend/src/common/guards/roles.guard.ts (real)
> @Injectable()
> export class RolesGuard implements CanActivate {
>   constructor(private readonly reflector: Reflector) {}
> ```
>
> `Reflector` is provided by the framework itself — proof that the container
> doesn't only know TaskFlow's classes; any registered provider (framework,
> library, or your own) is injectable by token.

---

## 6.3 Tokens: class tokens and string tokens

Every provider in the container is identified by a **token**. The default
token is the class itself — `provide: TasksService` is implicit when you list
`TasksService` in `providers`. But tokens can be anything: strings, symbols,
or `registerAs` keys. TaskFlow uses all of them.

### `@InjectModel(Task.name)` — injecting a Mongoose model

```ts
// backend/src/tasks/tasks.repository.ts (real)
@Injectable()
export class TasksRepository {
  constructor(
    @InjectModel(Task.name)
    private readonly taskModel: Model<TaskDocument>,
  ) {}
```

`Model<TaskDocument>` is an *interface* — it has no runtime value, so the
container cannot guess it from `design:paramtypes`. `@InjectModel(Task.name)`
supplies the token explicitly: it's the string `'Task'`, which is the token
the Mongoose module registered when `TasksModule` called
`MongooseModule.forFeature([{ name: Task.name, schema: TaskSchema }])`
(Chapter 11 goes deep on Mongoose; here, notice the *token match*):
`forFeature` registers a provider under the token `Task.name`, and
`@InjectModel(Task.name)` resolves it.

### `@Inject(CACHE_MANAGER)` — a library's string token

```ts
// backend/src/common/interceptors/cache.interceptor.ts (real)
constructor(
  @Inject(CACHE_MANAGER) private cacheManager: Cache,
  private reflector: Reflector,
) {}
```

`CACHE_MANAGER` is a constant exported by `@nestjs/cache-manager` (a string
token like `'CACHE_MANAGER'`). The `CacheModule.registerAsync(...)` call in
`common/cache/cache.module.ts` registers a provider under that exact token.
Note the two styles side by side in one constructor: `@Inject(CACHE_MANAGER)`
for the string token, and plain constructor-injection for the `Reflector`
class token.

### `@Inject(jwtConfig.KEY)` — a typed configuration token

```ts
// backend/src/auth/auth.service.ts (real)
import jwtConfig from '../config/jwt.config';

constructor(
  private readonly usersService: UsersService,
  private readonly jwtService: JwtService,
  @Inject(jwtConfig.KEY)
  private readonly jwtConfiguration: ConfigType<typeof jwtConfig>,
  private readonly logger: Logger,
) {}
```

`jwtConfig` is created by `registerAs` (Chapter 5's config discussion):

```ts
// backend/src/config/jwt.config.ts (real)
export default registerAs('jwt', () => ({
  accessSecret: process.env.JWT_ACCESS_SECRET!,
  accessExpiresIn: 30 * 60, // 30 minutes
  refreshSecret: process.env.JWT_REFRESH_SECRET!,
  refreshExpiresIn: 30 * 24 * 60 * 60, // 30 days
  refreshExpiresInShort: 24 * 60 * 60, // 1 day
}));
```

`registerAs('jwt', ...)` does two things: it registers a provider under the
string token `'jwt'`, and it attaches that token as `jwtConfig.KEY` — so
`@Inject(jwtConfig.KEY)` is exactly `@Inject('jwt')`, but *typed*. The
`ConfigType<typeof jwtConfig>` type means `authService.jwtConfiguration`
is a strongly-typed object — `accessExpiresIn` is a number, not `any`.
This is the pattern to copy whenever you have typed configuration: define it
once with `registerAs`, inject it with `@Inject(config.KEY)` and
`ConfigType<typeof config>`.

> **❓ Interview question.** "What's the difference between a class token and
> a string token?" — A class token is the class itself; the container
> instantiates it. A string/symbol token names a value the container already
> has (a config object, a third-party client) or must build via a custom
> provider. When the type has no runtime value — an interface, a generic
> `Model<T>` — you must pass a token explicitly with `@Inject(...)`.

---

## 6.4 Custom providers — the five ways to provide

So far, every provider was a class that the container instantiates. That's
the *default*. The `providers` array actually accepts four shapes, and
TaskFlow uses three of them:

| Shape | Meaning | Where TaskFlow uses it |
|-------|---------|------------------------|
| `TasksService` | shorthand for `{ provide: TasksService, useClass: TasksService }` | everywhere |
| `{ provide: X, useClass: Y }` | "when someone asks for X, give them an instance of Y" | `APP_GUARD` in `app.module.ts` |
| `{ provide: X, useFactory: fn, inject: [...] }` | "build X by calling fn, resolving its own deps first" | `DatabaseModule`, `CacheModule`, `WebsocketModule` |
| `{ provide: X, useValue: value }` | "give them this exact object" | every test in Chapter 22 |
| `{ provide: X, useExisting: Y }` | "alias X to whatever Y resolves to" | not used in TaskFlow |

### `useClass` — the multi-provider trick: `APP_GUARD`

```ts
// backend/src/app.module.ts (real)
providers: [
  SearchService,
  DashboardService,
  {
    provide: APP_GUARD,
    useClass: ThrottlerGuard,
  },
  {
    provide: APP_GUARD,
    useClass: JwtAuthGuard,
  },
  {
    provide: APP_GUARD,
    useClass: RolesGuard,
  },
],
```

Three providers, **the same token** — `APP_GUARD`. Normally the container
rejects duplicate tokens. `APP_GUARD` is special: NestJS marks it as a
**multi-provider**, meaning "register all of these, and inject the whole
collection." Nest collects every `APP_GUARD` and runs them in declaration
order on every request: throttle → authenticate → authorize. One token,
three providers, one pipeline — that's how three guards are global without a
single `@UseGuards` anywhere (Chapters 4–5).

> **Why this design?** Registering guards as `APP_GUARD` providers, rather
> than `app.useGlobalGuards()` in `main.ts`, keeps them inside the DI
> container — which is exactly why `JwtAuthGuard` and `RolesGuard` can
> `constructor(private readonly reflector: Reflector)` at all. Code
> registered *outside* the container cannot be injected into.

### `useFactory` — configuration from the environment

The database connection can't be known at compile time; it depends on
environment variables. So `DatabaseModule` builds it with a factory:

```ts
// backend/src/database/database.module.ts (real)
MongooseModule.forRootAsync({
  imports: [ConfigModule],
  useFactory: (configService: ConfigService) => ({
    uri: configService.get<string>('MONGODB_URI'),
    maxPoolSize: parseInt(configService.get('MONGODB_MAX_POOL_SIZE') || '10', 10),
    minPoolSize: parseInt(configService.get('MONGODB_MIN_POOL_SIZE') || '2', 10),
    socketTimeoutMS: 45000,
    serverSelectionTimeoutMS: 5000,
  }),
  inject: [ConfigService],
}),
```

Read it as: *"the provider 'the Mongo connection' is the result of calling
this function; before calling it, resolve `ConfigService` and hand it in."*
The `inject` array is the factory's own mini-DI declaration — the factory
function's parameters are matched to tokens positionally. The same pattern
appears twice more:

```ts
// backend/src/common/cache/cache.module.ts (real)
NestCacheModule.registerAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => ({
    ttl: parseInt(configService.get('CACHE_TTL') || '300'),
    isGlobal: true,
  }),
}),
```

```ts
// backend/src/websocket/websocket.module.ts (real)
JwtModule.registerAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => ({
    secret: configService.get<string>('JWT_ACCESS_SECRET'),
  }),
}),
```

Three factories, one idea: **providers whose construction depends on
configuration arrive via `useFactory` + `inject`**. The alternative — reading
`process.env` inside the class — is a testing trap: you can't substitute
environment variables per test, but you *can* substitute a factory.

> **Why this design?** `useFactory` keeps configuration out of class bodies.
> `DatabaseModule` knows how to *build* the connection; no service ever
> touches `process.env.MONGODB_URI`. When tests run with an in-memory Mongo
> (the 197 tests), they override the connection provider — not the
> environment — because the factory is a provider like any other.

### The `@Global()` escape hatch

`ConfigModule.forRoot({ isGlobal: true })` in `app.module.ts` makes
`ConfigService` injectable *anywhere* — that's why `DatabaseModule` injects it
without importing `ConfigModule` itself. TaskFlow also marks three of its own
modules `@Global()`:

```ts
// backend/src/database/models/database-models.module.ts (real)
@Global()
@Module({
  imports: [MongooseModule.forFeature(models)],
  exports: [MongooseModule],
})
export class DatabaseModelsModule {}
```

```ts
// backend/src/common/logger/logger.module.ts (real)
@Global()
@Module({
  providers: [Logger],
  exports: [Logger],
})
export class LoggerModule {}
```

`@Global()` means "this module's exports are visible to every module, no
import needed." TaskFlow uses it for exactly the three things every feature
needs: **the models** (so `@InjectModel(User.name)` works in `UsersModule`
even though it imports nothing), **the logger**, and **config** (via
`isGlobal: true`). Everything else stays module-scoped.

> **⚠️ Common mistake.** Reaching for `@Global()` too early. A global module
> cannot be un-seen: it makes the dependency *invisible* in every module's
> `imports`, and the module graph stops telling the truth. TaskFlow's rule is
> visible in its code: global for infrastructure *everyone* needs (config,
> models, logging); `imports` for feature-to-feature needs (Tasks → Projects
> → Users). If a module is used by two features, export it and import it —
> don't globalize it.

---

## 6.5 Resolution and visibility — why `TasksModule` imports so much

Here is the real `TasksModule`, and it imports four feature modules:

```ts
// backend/src/tasks/tasks.module.ts (real)
@Module({
  imports: [
    ProjectsModule,
    UsersModule,
    MongooseModule.forFeature([{ name: Task.name, schema: TaskSchema }]),
    ActivityModule,
    NotificationsModule,
  ],
  controllers: [TasksController, TasksDependencyController],
  providers: [TasksService, TasksRepository, TaskDependencyService],
  exports: [TasksService, TasksRepository, TaskDependencyService],
})
export class TasksModule {}
```

Why does it need `ProjectsModule` and `UsersModule`? Look at the constructor
of `TasksService` again — it injects `ProjectsRepository` and `UsersService`,
which live in *other modules*. And here is the rule that makes DI sane:

> **A provider is only injectable inside the module that provides it, or a
> module that imports the module that exports it.**

`TasksModule` imports `ProjectsModule`; `ProjectsModule` exports
`ProjectsRepository`; therefore `TasksService` can inject it. The chain is
explicit at every hop:

```
TasksModule.imports: ProjectsModule ──exports──▶ ProjectsRepository
                                    ──exports──▶ ProjectsService
                     UsersModule    ──exports──▶ UsersService
                                              ──exports──▶ UsersRepository
```

Now trace the *non*-import: `TasksService` emits `'task.assigned'` and never
injects `NotificationsService`. The *listener* — inside the notifications
module — injects `NotificationsRepository` and subscribes. The dependency
points one way (notifications listens, core doesn't know), and that one-way
direction is exactly what prevents the circular dependency of §6.7:

```ts
// backend/src/notifications/listeners/notification.listener.ts (real)
/**
 * This class decouples the "core" modules (Tasks, Comments) from the
 * Notification module via the EventEmitter. The tasks/comments services
 * emit events; this listener reacts by persisting a notification.
 *
 * Benefits:
 * - Core services don't import NotificationService → no circular deps
 * ...
 */
```

And here is a detail worth noticing: `TasksModule` also imports
`ActivityModule` and `NotificationsModule` — yet nothing in the tasks folder
injects `ActivityService` or `NotificationsService`. The imports are legal
(NestJS doesn't require you to inject everything you import), and the
notification semantics run through the event bus, not through DI. An import
with no consumer is a small smell: the module *can* now inject those
providers, so the graph promises more than the code uses. One day that import
will either get its consumer (an activity-logging line in `TasksService`) or
should be removed. Leave it as a question worth asking in review: *which
imports does this module actually use?*

> **Why this design?** DI gives you the graph, but *you* choose the edges.
> TaskFlow's edges are chosen so that the graph is a **DAG — a directed
> acyclic graph** — with dependencies flowing from core (users, projects,
> tasks) toward infrastructure (notifications, activity). A DAG cannot deadlock;
> a graph with cycles can. The module imports above are the visible proof of
> that policy.

### The resolution order, concretely

When `AppModule` boots, the container resolves bottom-up: providers with no
dependencies first, then their dependents. Concretely for
`POST /api/tasks`:

```
Boot order (topological)
1.  ConfigService            (from ConfigModule.forRoot)
2.  Model<Task>              (from MongooseModule.forFeature)
3.  TasksRepository          (needs Model<Task>)
4.  ProjectsRepository       (needs Model<Project>)
5.  UsersRepository          (needs Model<User>)
6.  UsersService             (needs UsersRepository)
7.  EventEmitter2            (from EventEmitterModule.forRoot)
8.  TasksService             (needs 4, 5, 6, 7 — all built above)
9.  TasksController          (needs TasksService)
```

NestJS computes this order automatically (it's a topological sort of the
dependency graph). You never write it by hand — and if you *try* to write it
by hand, you're back to the `new`-keyword problem of §6.1. That, in one
sentence, is what the container buys: **dependency ordering is solved once,
by the framework, for the whole app.**

> **❓ Interview question.** "What happens at NestJS boot?" — Nest reads every
> module's `imports`/`providers`, builds the provider graph, resolves
> dependencies in topological order, and instantiates singletons. Any missing
> or circular dependency aborts startup with `Nest can't resolve dependencies
> of ...`. The app never starts half-wired.

---

## 6.6 Scopes — how long does a provider live?

Every provider in TaskFlow is a **singleton** — one instance per app, shared
by every consumer — except one. NestJS supports three scopes:

| Scope | Lifetime | TaskFlow |
|-------|----------|----------|
| `Scope.DEFAULT` | One instance per application, shared everywhere | everything except the logger |
| `Scope.REQUEST` | A new instance per incoming request | **none — deliberately** |
| `Scope.TRANSIENT` | A new instance per *injection* (each consumer gets its own) | `Logger` |

### The singleton default

`TasksService` is instantiated once at boot. Every controller and service that
injects it receives the *same* instance. This is safe only because TaskFlow's
providers are **stateless** — they hold no per-request data, only dependencies
and configuration. That is the contract that makes singletons work, and it is
why the request lifecycle of Chapter 5 works: request-specific data travels
in the `ExecutionContext` (guards), the DTO (pipes), and parameters
(controllers) — never in a service field.

> **In the TaskFlow repo** — the one non-default provider:
>
> ```ts
> // backend/src/common/logger/logger.service.ts (real)
> @Injectable({ scope: Scope.TRANSIENT })
> export class Logger implements LoggerService {
>   private logger: winston.Logger;
>   ...
> ```
>
> Every class that injects `Logger` gets its **own** instance (each wrapping
> its own winston logger). Why transient? So loggers can carry per-consumer
> context without sharing state across services — and because a logger is
> cheap to create, the cost of N instances is nil. It is the *only*
> non-singleton provider in the whole codebase — a fact worth remembering
> when you're tempted to make a provider `REQUEST`-scoped.

### Why TaskFlow has no `REQUEST`-scoped providers

`Scope.REQUEST` creates a fresh instance per request — useful when a provider
must hold request state. TaskFlow avoids it, and the reason is performance
and discipline:

1. **Singletons are cached; REQUEST providers are not.** NestJS must re-instantiate
   the whole request-scoped chain (and its dependent chain) for *every*
   request — measurable overhead at 500+ concurrent users (NFR-010).
2. **They make testing awkward.** Request-scoped providers need
   `RequestContext` plumbing in unit tests.
3. **They're usually unnecessary.** If you need the request, use guards,
   pipes, or interceptors — they receive `ExecutionContext` without any scope
   games (Chapter 5's whole pipeline). TaskFlow demonstrates this: the
   `RolesGuard` needs the user, and it gets it from
   `context.switchToHttp().getRequest()` — not from a request-scoped
   injection. Chapter 15 will show `VisibilityPolicyService` doing the same.

> **Why this design?** "One instance, shared, stateless" is a discipline, not
> a convenience. It forces request data out of providers (into
> `ExecutionContext`/DTOs/parameters), which keeps the request path explicit
> and testable. When you find yourself reaching for `REQUEST` scope, ask:
> *can I instead read the request from the context object at the point I
> need it?* In TaskFlow the answer is always yes.

---

## 6.7 Circular dependencies — and TaskFlow's structural answer

A circular dependency is `A` needs `B`, and `B` needs `A`. The container
cannot construct either — every resolution starts an infinite regress — and
Nest aborts boot with:

```
Nest can't resolve dependencies of the A (B, ...).
```

There are three ways out, in order of preference:

### 1. Break the cycle structurally — the TaskFlow way

The nastiest cycle in a task manager would be: *tasks need notifications
("notify when a task is assigned"), and notifications need tasks (deep links
into tasks).* TaskFlow's comment inside `notification.listener.ts` states the
resolution: **core modules emit events; the notifications module listens.**
`TasksService` and `CommentsService` emit typed events; `NotificationListener`
— a provider in the *notifications* module — subscribes with `@OnEvent`:

```ts
// backend/src/notifications/listeners/notification.listener.ts (real)
@OnEvent('task.assigned')
async handleTaskAssigned(event: TaskAssignedEvent) {
  await this.notificationsRepository.create({
    recipient: new Types.ObjectId(event.assigneeId),
    type: NotificationType.TASK_ASSIGNED,
    title: 'Task Assigned',
    message: `You have been assigned to task: "${event.taskTitle}"`,
    link: `/tasks/${event.taskId}`,
    ...
```

`TasksService` **emits** the event and moves on; it never imports
`NotificationsService`. The dependency arrow runs one way — tasks don't know
notifications exist — so the cycle cannot form. DI and events complement
each other: **DI wires synchronous structure; events wire asynchronous
decoupling.** Chapter 18 is the full case study.

### 2. Extract a shared module

If two modules genuinely both need X, X doesn't belong in either — it belongs
in its own module that both import. TaskFlow does this with the *models*
(`DatabaseModelsModule`, `@Global()`) and the *logger* (`LoggerModule`): the
things everyone needs are lifted out so no two features depend on each other
for them.

### 3. `forwardRef()` — the last resort

NestJS ships `forwardRef(() => A)` for genuine cycles that can't be
restructured. TaskFlow contains **no** `forwardRef` — and that absence is the
point. `forwardRef` doesn't fix the design; it papers over it with lazy
resolution, and it breaks one of DI's best features (failing loudly at boot).
If you reach for it, the correct follow-up is a refactor — usually an event or
a shared module.

> **❓ Interview question.** "How do you handle circular dependencies in
> NestJS?" — In order: (1) restructure so the dependency is one-way — events
> and the listener pattern are the canonical fix; (2) extract the shared
> dependency into its own module; (3) only then `forwardRef()`, and treat it
> as a code smell to refactor. TaskFlow's answer is (1) via its event
> pipeline — zero `forwardRef` in the codebase.

---

## 6.8 Testing against the container — `Test.createTestingModule`

DI's payoff is testing: the *same* constructor requirements list that drives
the container also tells you exactly what a test must fake. NestJS's testing
module runs the real container machinery with substituted providers:

```ts
// backend/src/tasks/tasks.service.spec.ts (real, abridged)
const module: TestingModule = await Test.createTestingModule({
  providers: [
    TasksService,                            // the real class — container will build it
    {
      provide: TasksRepository,              // the token TasksService asks for
      useValue: {                            // ...resolves to THIS fake instead
        create: jest.fn(),
        findAll: jest.fn(),
        findById: jest.fn(),
        findByProject: jest.fn(),
        findByAssignee: jest.fn(),
        update: jest.fn(),
      },
    },
    {
      provide: ProjectsRepository,
      useValue: { findById: jest.fn() },
    },
    {
      provide: UsersService,
      useValue: { findById: jest.fn() },
    },
    {
      provide: EventEmitter2,
      useValue: { emit: jest.fn() },
    },
  ],
}).compile();

service = module.get<TasksService>(TasksService);
```

`useValue` is the fourth provider shape from §6.4's table — and the most
important one for tests. `TasksService` is instantiated by the real
container, its constructor metadata is read, and every dependency resolves
to a `jest.fn()` fake. No database, no HTTP, no event emitter. The unit test
then asserts the *business rules* (`create()` rejects a nonexistent project,
rejects a non-member assignee, emits `task.assigned` on success) in
milliseconds.

Two mechanics worth naming:

- `module.get<T>(Token)` retrieves a provider *after* compile — tests grab
  the service, then the fakes, to assert on them.
- If a provider is missing from the testing module, the container fails with
  the *exact same* "can't resolve dependencies" error as boot — your unit
  test becomes a static check that the class's requirements list is honest.

> **Why this design?** The spec file above is the whole testing story of
> Chapter 22 in miniature: real container, fake leaves. Every seam DI creates
> (repository, service, event emitter) is a place a test can substitute —
> which is why TaskFlow's tests are fast, hermetic, and honest. A codebase
> without DI would need a database running to test *anything*.

---

## 6.9 Common mistakes

**1. Forgetting `@Inject()` for interface-typed parameters.** `Model<T>`,
`Cache`, `ConfigType<...>` — anything that is an interface or generic has no
runtime type. Without `@Inject`, `design:paramtypes` records `Object` and the
container fails at boot. TaskFlow's pattern: `@InjectModel(...)`,
`@Inject(CACHE_MANAGER)`, `@Inject(jwtConfig.KEY)`.

**2. Making everything `@Global()`.** Global modules make dependencies
invisible. TaskFlow globalizes only config, models, and logging — the things
*every* feature needs. Feature-to-feature needs go through explicit `imports`.

**3. `REQUEST` scope as a first reflex.** Needing the request is not a reason
to scope to REQUEST — use `ExecutionContext` in guards/interceptors/pipes
(Chapter 5). TaskFlow ships zero REQUEST-scoped providers.

**4. A provider holding request state.** A singleton that stores per-request
data (e.g. `this.currentUserId = ...`) leaks data between requests — the
classic concurrency bug of shared mutable state. Stateless providers or
explicit parameters.

**5. Reaching for `forwardRef()`.** It disables the boot-time failure that
protects you. Restructure: events or a shared module first (TaskFlow: zero
`forwardRef`).

**6. Reading `process.env` inside a provider.** `useFactory` + `inject` keeps
configuration substitutable. `process.env` is global, untyped, and untestable.

**7. Not using the testing module.** Writing a unit test with a real
database defeats DI's main benefit. If your test module needs fakes for
half the app, that's the point — use `useValue`.

---

## Exercises

### 🟢 Concept

1. What does `emitDecoratorMetadata: true` do, and why is DI impossible
   without it (or something equivalent)?
2. Name the four custom-provider shapes from §6.4 and one real TaskFlow
   example of each.
3. Why can `TasksService` inject `ProjectsRepository`? Name the three files
   involved in making that legal.
4. Why does TaskFlow have no `REQUEST`-scoped providers? Where does the
   request object come from instead?
5. `TasksService` needs to notify the assignee when a task is created — yet
   it never injects `NotificationsService`. How does the notification
   happen, and what dependency does this avoid?

### 🟡 Code

6. Open `backend/src/auth/auth.service.ts`. List every injected dependency,
   classify each as class token, string token, or `registerAs` token, and
   find the module file that makes each injectable.
7. Open `backend/src/comments/comments.module.ts` (real: imports
   `TasksModule`, `ProjectsModule`). Draw the injection chain that lets
   `CommentsService` use `TasksRepository` — module by module, export by
   export.
8. In `backend/src/common/guards/roles.guard.ts`, `Reflector` is injected
   with no `@Inject`. Explain why that works (what token is `Reflector`?).

### 🔴 Debug

9. A developer writes `@Injectable({ scope: Scope.REQUEST })` on
   `TasksRepository` to "fix" a test. Predict the effect on the app: what
   happens to the singleton graph, to `TasksService`, and to the test that
   used `useValue`? What was the actual problem, and what is the right fix?
10. The app fails at boot with `Nest can't resolve dependencies of
    CommentsService (?). Please make sure that the argument at index [1] is
    available`. `CommentsService`'s second parameter is
    `tasksRepository: TasksRepository`. Explain, in terms of §6.5's
    visibility rule, which line in `comments.module.ts` is missing — and
    what the compiler error would have said instead if the parameter were
    interface-typed.

### ⚫ Mini-project

11. Add a provider to TaskFlow: a `RequestIdService` that generates a short
    id per injection. Register it in `LoggerModule` as `Scope.TRANSIENT`,
    inject it into `Logger`, and log the id with each message. Then write a
    tiny `Test.createTestingModule` for `Logger` with a `useValue` fake for
    the service. (If you want the harder version: make the id come from a
    `registerAs('request', ...)` config and inject it with
    `@Inject(requestConfig.KEY)`.)

---

## Interview questions

1. "How does dependency injection work in NestJS?" — `emitDecoratorMetadata`
   records constructor parameter types; the container resolves tokens against
   its provider map at boot, building a graph in topological order. Failing
   wiring aborts boot.
2. "What's a provider token, and when do you need `@Inject`?" — A token is
   what the container resolves by. Class tokens need no `@Inject`; string and
   symbol tokens, and anything whose type has no runtime value (interfaces,
   `Model<T>`), need `@Inject(...)`.
3. "How do you make a third-party library's provider injectable?" — Register
   it under its token in a module (TaskFlow: `CACHE_MANAGER` via
   `CacheModule.registerAsync`), then `@Inject(CACHE_MANAGER)` where needed.
4. "What's the difference between `Scope.DEFAULT`, `REQUEST`, and
   `TRANSIENT`?" — One per app; one per request; one per injection. TaskFlow
   uses DEFAULT everywhere and TRANSIENT for `Logger`; no REQUEST providers.
5. "How do you avoid circular dependencies?" — Structural answers first:
   events/listeners (TaskFlow's approach), shared modules, extracting the
   common dependency. `forwardRef()` only as a documented last resort.
6. "How would you test a service that depends on a repository?" —
   `Test.createTestingModule` with `{ provide: Repository, useValue: fake }`,
   compile, `module.get(Service)`. The constructor's requirements list tells
   you exactly what to fake.
7. "What is `APP_GUARD` and why is it in `providers`?" — A multi-provider
   token: every registered `APP_GUARD` runs globally on every request, in
   declaration order. Registering guards as providers (not
   `useGlobalGuards`) lets them inject dependencies like `Reflector`.

---

## Key takeaways

1. **DI means a class declares its needs; the container supplies them.** The
   constructor is a requirements list; the container reads it at runtime via
   `design:paramtypes` metadata.
2. **Tokens can be classes, strings, or keys.** `@InjectModel`,
   `@Inject(CACHE_MANAGER)`, and `@Inject(jwtConfig.KEY)` are the three real
   TaskFlow idioms — interfaces and generics always need an explicit token.
3. **Custom providers make wiring declarative.** `useClass` for multi-provider
   globals (`APP_GUARD`), `useFactory` + `inject` for configuration-driven
   construction, `useValue` for tests.
4. **Visibility follows the module graph.** A provider is injectable only
   where its module (or a global) makes it visible — `imports` + `exports`
   are the language of the dependency graph. Keep it acyclic.
5. **Scopes are a discipline.** Singletons + stateless providers + the
   `ExecutionContext` make REQUEST scope unnecessary; the one TRANSIENT
   provider (`Logger`) proves the pattern.
6. **The container is a test harness.** `Test.createTestingModule` runs the
   real machinery with fake leaves — the reason 197 tests run in seconds
   without a database.

## Further reading

- [NestJS — Dependency Injection](https://docs.nestjs.com/fundamentals/dependency-injection) —
  the official DI reference: providers, tokens, custom providers, scopes.
- [NestJS — Custom Providers](https://docs.nestjs.com/fundamentals/custom-providers) —
  `useValue`/`useClass`/`useFactory`/`useExisting` and when each belongs.
- [NestJS — Injection Scopes](https://docs.nestjs.com/fundamentals/injection-scopes) —
  DEFAULT/REQUEST/TRANSIENT and their performance implications.
- *Dependency Injection* — Mark Seemann. The definitive text on DI as a
  design principle, including the composition-root pattern this chapter's
  boot sequence implements.
- Re-read Chapter 4 §4.4–4.5 — you now know *why* the module tree is a DAG,
  not just what it contains.

---

*In Chapter 7, we turn from the machinery that wires the app to the layer
that meets the network: controllers — every decorator TaskFlow uses,
explained one by one.*

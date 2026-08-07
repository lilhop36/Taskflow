# Chapter 7 — Controllers, Every Decorator Explained

> **Opening scenario.** A junior developer is assigned their first real bug
> in TaskFlow. `POST /api/tasks` is returning `400` with
> `"project must be a valid MongoDB ID"`, even though the project id looks
> fine to them. They open `TasksController` and stare at it:
>
> ```ts
> @Post()
> @Roles(UserRole.PROJECT_MANAGER, UserRole.ADMIN)
> @HttpCode(HttpStatus.CREATED)
> async create(
>   @Body() createTaskDto: CreateTaskDto,
>   @CurrentUser('_id') userId: string,
>   @CurrentUser('role') userRole: UserRole,
> ) {
>   return this.tasksService.create(createTaskDto, userId, userRole);
> }
> ```
>
> What is `@Controller` doing? Where did `createTaskDto` come from? What do
> `@Roles` and `@HttpCode` actually *do* to the request? And why does the
> DTO's error message — from a validation library — have anything to do with
> a controller?
>
> This chapter answers all of it. Controllers are the layer that turns HTTP
> into code, and the decorators are the vocabulary of that translation. By
> the end you will be able to read any TaskFlow controller the way you read
> a sentence — and write new routes without guessing.

You met the controller in Chapter 4 as the thin layer that parses, delegates,
and shapes. Chapter 5 traced one request through it. Now we take the layer
apart piece by piece: every decorator TaskFlow uses, what it registers, where
the values come from, and what order everything runs in.

**Learning objectives.** By the end of this chapter you will be able to:

- read a `@Controller('path')` declaration and know every URL it owns;
- use the HTTP method decorators (`@Get`, `@Post`, `@Patch`, `@Delete`) and
  know why TaskFlow uses no `@Put`;
- extract any value from a request with `@Body`, `@Param`, `@Query`, and
  the custom `@CurrentUser` — and know when to pass an argument and when not
  to;
- explain the two kinds of custom decorators — metadata decorators
  (`@Roles`, `@Public`, `@Throttle`) read by guards, and parameter decorators
  (`@CurrentUser`) that inject values;
- explain what `@Res({ passthrough: true })` changes, and when TaskFlow
  deliberately uses the raw response;
- predict route-matching behavior — why `GET /users/me/login-history` can
  coexist with `GET /users/:id`, and why order matters;
- and diagnose a 400-vs-404-vs-403 from the controller layer alone.

---

## 7.1 The controller: the layer that translates

A **controller** is a plain TypeScript class that NestJS turns into a route
map. Its one job is translation:

- **In**: the HTTP request — URL, body, query string, headers, the
  authenticated user — becomes a typed function call.
- **Out**: a return value becomes the HTTP response body.

That's the whole contract. Everything a controller does is one of these
three moves (from Chapter 4):

1. **Parse** — decorators pull values off the request and hand them to the
   method as typed parameters.
2. **Delegate** — the method body calls *one* service method and returns its
   result. Business logic never lives here.
3. **Shape** — what the method returns is what the client receives (after the
   response pipeline — Chapter 5).

Every TaskFlow controller follows this shape. Here is the smallest complete
one:

```ts
// backend/src/health/health.controller.ts (real)
@Controller('health')
export class HealthController {
  constructor(@InjectConnection() private readonly dbConnection: Connection) {}

  @Public()
  @Get()
  health() {
    ...
    return { status: 'ok', db: ..., timestamp: new Date().toISOString() };
  }
}
```

A class, an injected dependency in the constructor, one `@Get()` — done. The
rest of this chapter explains every decorator that can appear in that class.

> **Why this design?** Because the HTTP layer is the *least* interesting part
> of the system, it should be the cheapest to write and the fastest to
> review. When every controller is just parse → delegate → shape, a reviewer
> can verify a new endpoint is safe (roles? id validation? thin?) in seconds.

---

## 7.2 `@Controller(path)` — claiming a URL prefix

```ts
@Controller('tasks')
export class TasksController { ... }
```

`@Controller('tasks')` registers the class as a route map whose every
endpoint is prefixed with `tasks`. Combined with the global `/api` prefix
from `main.ts` (Chapter 5), every route in this class lives under
`/api/tasks`.

The path can be a plain segment, a nested path, or empty:

| Controller | Route declared | Full URL |
|------------|---------------|----------|
| `@Controller('tasks')` | `@Post()` | `POST /api/tasks` |
| `@Controller('tasks')` | `@Patch(':id/status')` | `PATCH /api/tasks/:id/status` |
| `@Controller('tasks/:taskId/comments')` | `@Post()` | `POST /api/tasks/:taskId/comments` |
| `@Controller('health')` | `@Get()` | `GET /api/health` |

The `:name` segments are **route parameters** — placeholders that match any
value, read later with `@Param('name')`. The nested comments controller is
the canonical example: comments *belong to* a task, and the URL says so:

```ts
// backend/src/comments/comments.controller.ts (real)
@Controller('tasks/:taskId/comments')
export class CommentsController {
  @Get()
  async findAll(
    @Param('taskId', MongoIdValidationPipe) taskId: string,
    ...
  ) { ... }
}
```

Every comment route carries its parent task's id in the URL itself — no
guessing where a comment hangs from.

> **Why this design?** Nested URLs are self-describing REST: the URL
> expresses the resource hierarchy (task → comments). A flat
> `/api/comments?task=...` would push the relationship into query strings and
> let invalid combinations (a comment from one task asked under another)
> pass through. The hierarchy is in the route, so it's in the contract.

---

## 7.3 Method decorators — which verb, which URL, which status

Each HTTP verb has a decorator. TaskFlow uses four of them:

| Decorator | Meaning | Real examples |
|-----------|---------|---------------|
| `@Get(path?)` | read — no side effects | `GET /api/tasks`, `GET /api/tasks/:id` |
| `@Post(path?)` | create a resource | `POST /api/tasks`, `POST /api/auth/login` |
| `@Patch(path?)` | partial update | `PATCH /api/tasks/:id`, `PATCH /api/tasks/:id/status` |
| `@Delete(path?)` | delete a resource | `DELETE /api/teams/:id`, `DELETE /api/tasks/:taskId/comments/:commentId` |

The decorator's argument is the suffix after the controller prefix:

```ts
// backend/src/tasks/tasks.controller.ts (real)
@Controller('tasks')
export class TasksController {
  @Post()               // → POST /api/tasks
  @Get()                // → GET /api/tasks
  @Get(':id')           // → GET /api/tasks/:id
  @Patch(':id')         // → PATCH /api/tasks/:id
  @Patch(':id/status')  // → PATCH /api/tasks/:id/status
  ...
}
```

**Why no `@Put` anywhere in TaskFlow?** `PUT` means *replace the whole
resource*; `PATCH` means *modify part of it*. TaskFlow's updates are all
partial — change a status, a title, a role — so `@Put` would signal a
semantic it doesn't deliver. The verb is part of the contract; TaskFlow
picks `@Patch` deliberately, every time.

### `@HttpCode` — status codes are part of the contract

NestJS defaults: `POST` → 201, everything else → 200. When a route
contradicts the default, the controller declares it explicitly:

```ts
// backend/src/auth/auth.controller.ts (real)
@Post('login')
@HttpCode(HttpStatus.OK)
async login(...)
```

Login *authenticates*; it creates no resource — so it returns 200, not 201.
TaskFlow writes `@HttpCode` even where it matches the default (e.g.
`@Post() @HttpCode(HttpStatus.CREATED)` on task creation) because the status
is part of the endpoint's contract, and contracts should be visible where
they're written.

> **❓ Interview question.** "Why does `POST /login` return 200 instead of
> 201?" — 201 means "resource created". Login creates no resource; it
> authenticates a user and establishes a session, so 200 is semantically
> correct. `@HttpCode(HttpStatus.OK)` is how TaskFlow says that deliberately.

---

## 7.4 Parameter decorators — where the arguments come from

A route handler's parameters are each bound by a decorator. NestJS reads
`design:paramtypes` metadata (Chapter 6 §6.2) to build the argument list,
and each decorator tells it *where* to get that value from.

| Decorator | Source | Real usage |
|-----------|--------|------------|
| `@Body()` | the parsed JSON request body | the DTO (`CreateTaskDto`) |
| `@Param('id')` | a `:id` route segment | resource ids |
| `@Query('status')` | the query string | filters, pagination |
| `@CurrentUser()` | `req.user`, set by the JWT guard | the authenticated user |
| `@Req()` | the raw Express request | headers, IP address |
| `@Res()` | the raw Express response | cookies, binary downloads |

### `@Body()` — the payload, validated before it arrives

```ts
// backend/src/tasks/tasks.controller.ts (real)
@Post()
async create(
  @Body() createTaskDto: CreateTaskDto,
  ...
)
```

`@Body()` binds the whole parsed JSON body and — because of the global
`ValidationPipe` in `main.ts` (Chapter 5) — *validates it against the DTO
before the method runs*. Invalid input never reaches the controller body; the
pipe throws a 400 with the DTO's own message. That's where the opening
scenario's `"project must be a valid MongoDB ID"` comes from: the DTO says
`@IsMongoId()` on `project`, the pipe enforces it, and the controller
never runs.

```ts
// backend/src/tasks/dto/create-task.dto.ts (real)
export class CreateTaskDto {
  @IsNotEmpty({ message: 'Task title is required' })
  @IsString({ message: 'Title must be a string' })
  @MaxLength(200, { message: 'Task title must not exceed 200 characters' })
  title: string;

  ...
  @IsNotEmpty({ message: 'Project ID is required' })
  @IsMongoId({ message: 'Project must be a valid MongoDB ID' })
  project: string;
}
```

`@Body()` without an argument gets the whole body. `@Body('fieldName')` gets
one field — used when a single optional value shouldn't be forced through a
DTO:

```ts
// backend/src/auth/auth.controller.ts (real)
async refresh(
  @Req() req: Request,
  @Res({ passthrough: true }) res: Response,
  @Body('refreshToken') bodyToken?: string,
) {
  const token = req.cookies?.refresh_token || bodyToken;
  ...
}
```

> **Why this design?** The DTO is the contract (Chapter 13's territory). By
> validating at the boundary, the controller can trust its inputs — no
> defensive `if (!dto.project)` checks in the method body. TaskFlow's rule:
> multi-field payloads get a DTO + `@Body()`; lone optional fields get
> `@Body('field')`.

### `@Param('id')` — reading route segments

```ts
// backend/src/teams/teams.controller.ts (real)
@Patch(':id')
update(
  @Param('id', MongoIdValidationPipe) id: string,
  ...
)
```

`@Param('id')` binds the `:id` segment. The second argument is a **pipe** —
TaskFlow validates every id with `MongoIdValidationPipe` (Chapter 5's
pipes):

```ts
// backend/src/common/pipes/mongo-id-validation.pipe.ts (real)
@Injectable()
export class MongoIdValidationPipe implements PipeTransform<string> {
  transform(value: string, metadata: ArgumentMetadata): string {
    if (!isValidObjectId(value)) {
      throw new BadRequestException(
        `Invalid ${metadata.type === 'param' ? 'parameter' : 'query'} format: ${value} is not a valid MongoDB ObjectId`,
      );
    }
    return value;
  }
}
```

The pipe rejects malformed ids with a clean 400 **before** the handler runs —
so a bad id never becomes a 500 deep in Mongoose (Chapter 9's exception
filter). Every `@Param` in TaskFlow carries it; nested routes take two:

```ts
// backend/src/comments/comments.controller.ts (real)
async update(
  @Param('taskId', MongoIdValidationPipe) taskId: string,
  @Param('commentId', MongoIdValidationPipe) commentId: string,
  ...
)
```

### `@Query()` — filters and pagination

```ts
// backend/src/tasks/tasks.controller.ts (real)
@Get()
async findAll(
  @Query() pagination: PaginationDto,
  @Query('project') projectId?: string,
  @Query('assignee') assigneeId?: string,
  @Query('status') status?: string,
  @CurrentUser() user?: UserDocument,
) {
```

This is TaskFlow's richest signature: a *whole query-string DTO* plus three
individual query keys — all read from the same `?project=...&page=2` string.
The `PaginationDto` turns strings into bounded numbers via class-transformer:

```ts
// backend/src/common/dto/pagination.dto.ts (real)
export class PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @Min(1)
  page: number = 1;
  ...
  get skip(): number {
    return ((this.page || 1) - 1) * (this.limit || 10);
  }
}
```

Note the query-string trap the DTO exists to solve: **query values arrive as
strings**. `?page=2` is the string `"2"`; without `@Type(() => Number)` it
would fail `@IsInt()`, and without `@Min(1)` a hostile `?page=-5` would sail
through.

### `@CurrentUser()` — the custom parameter decorator

`@CurrentUser` is TaskFlow's own decorator (Chapter 6's payoff), built with
`createParamDecorator`. It reads `req.user` — the object the JWT strategy
attached to the request (Chapter 14):

```ts
// backend/src/common/decorators/current-user.decorator.ts (real)
export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as UserDocument;

    if (!user) {
      return null;
    }

    return data ? user[data as keyof UserDocument] : user;
  },
);
```

The `data` argument is what you pass in parentheses:

- `@CurrentUser()` — the whole `UserDocument`
- `@CurrentUser('_id')` — just the id
- `@CurrentUser('role')` — just the role

TaskFlow mixes them freely, taking exactly the slice each handler needs:

```ts
// backend/src/projects/projects.controller.ts (real)
async update(
  @Param('id', MongoIdValidationPipe) id: string,
  @Body() updateProjectDto: UpdateProjectDto,
  @CurrentUser('_id') userId: string,
  @CurrentUser('role') userRole: UserRole,
) {
  return this.projectsService.update(id, updateProjectDto, userId, userRole);
}
```

> **Why this design?** The guard authenticated the user once (Chapter 5's stage
> 6); `@CurrentUser` is how every handler reads that result without touching
> `req` directly. It's the same idea as DI — the request's authenticated
> identity is *injected* into the handler, not fetched. And like DI, it makes
> the handler trivially testable: no request object to mock, just the
> decorator.

---

## 7.5 Metadata decorators — flags that guards read

Parameter decorators *inject values*. A second family of decorators
*writes metadata* — flags on the route that NestJS's guards read later. The
one-line version: **the decorator sets metadata; the guard reads it.**

### `@Roles(...)` and `RolesGuard` — the two sides of authorization

```ts
// backend/src/common/decorators/roles.decorator.ts (real)
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
```

`SetMetadata(ROLES_KEY, roles)` attaches the array to the handler's metadata
under the key `'roles'`. That's all the decorator does — one function call at
decoration time. The enforcement lives in `RolesGuard`, which reads the metadata
at request time:

```ts
// backend/src/common/guards/roles.guard.ts (real)
const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
  ROLES_KEY,
  [context.getHandler(), context.getClass()],
);

if (!requiredRoles || requiredRoles.length === 0) {
  return true;
}
```

Two details matter:

1. **`getAllAndOverride` reads both the method *and* the class.** `@Roles`
   works at either level — and a method-level value overrides a class-level
   one. That's how TaskFlow expresses "default for the whole controller,
   exception for one route":

```ts
// backend/src/users/users.controller.ts (real)
@Controller('users')
@Roles(UserRole.ADMIN)          // whole controller: Admin-only
export class UsersController {
  @Get('me/login-history')
  @Roles(UserRole.TEAM_MEMBER)  // this one route: any authenticated member
  async getMyLoginHistory(...)
```

2. **No metadata means no restriction.** A route with no `@Roles` passes the
   roles guard — *after* passing the JWT guard (Chapter 1's chain: authenticate
   first, then authorize).

```ts
// backend/src/tasks/tasks.controller.ts (real)
@Post()
@Roles(UserRole.PROJECT_MANAGER, UserRole.ADMIN)
@HttpCode(HttpStatus.CREATED)
async create(...)
```

### `@Public()` — the single opt-out from authentication

```ts
// backend/src/common/guards/jwt-auth.guard.ts (real)
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```

`JwtAuthGuard` runs on *every* request (it's an `APP_GUARD` — Chapter 6
§6.4) and checks for the flag:

```ts
// backend/src/common/guards/jwt-auth.guard.ts (real)
const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
  context.getHandler(),
  context.getClass(),
]);

if (isPublic) {
  return true;
}

return super.canActivate(context);
```

TaskFlow's security posture is **authenticated by default** — a new route
with no decorators is automatically protected. `@Public()` is the explicit,
visible escape hatch for the few endpoints that must work without a token:

```ts
// backend/src/auth/auth.controller.ts (real)
@Public()
@Throttle({ default: { limit: 5, ttl: 60000 } })
@Post('login')
```

(We'll meet the full guard chain in Chapters 14–15; here the point is the
decorator mechanism.)

### `@Throttle` and `@SkipThrottle` — per-route rate limits

Rate limiting runs globally (the `ThrottlerGuard` is the first `APP_GUARD`
in `app.module.ts` — 100 requests/minute per IP). Two metadata decorators
adjust it per route:

```ts
// backend/src/auth/auth.controller.ts (real)
@Throttle({ default: { limit: 5, ttl: 60000 } })  // 5/min — brute-force protection
@Post('login')
```

```ts
// backend/src/notifications/notifications.controller.ts (real)
@Get('unread-count')
@SkipThrottle() // lightweight; polled on every page mount
async getUnreadCount(@CurrentUser('_id') userId: string) {
```

Auth routes tightened to 5/min (Chapter 25); the unread-count endpoint —
polled on every page mount — exempted so it never counts against the user.
Same mechanism as `@Roles`: metadata in, guard reads it out.

> **Why this design?** Putting security in decorators keeps the policy *next
> to the route it governs*. A reviewer sees `@Roles(...)`, `@Public()`,
> `@Throttle(...)` on the handler itself — no hunting through config files.
> The enforcement stays centralized in guards (one place to get right),
> while the per-route declaration stays visible where it matters.

---

## 7.6 The raw request — `@Req` and `@Res`

Most of the time NestJS's abstractions are enough. Two decorators step down
to raw Express objects when the abstraction doesn't fit.

### `@Req()` — reading what the framework doesn't abstract

```ts
// backend/src/auth/auth.controller.ts (real)
async login(
  @Body() loginDto: LoginDto,
  @Req() req: Request,
  @Res({ passthrough: true }) res: Response,
) {
  const user = await this.authService.validateUser(loginDto);
  return this.authService.login(user, res, loginDto.rememberMe ?? false, {
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });
}
```

`req.ip` and `req.headers['user-agent']` are audit data (login history —
Chapter 14) with no NestJS decorator. `@Req()` is the honest escape hatch,
used exactly where the raw request is genuinely needed.

### `@Res()` and the passthrough trap

`@Res()` hands the handler the raw Express *response* — and switches NestJS
into "you manage the response" mode: **the handler's return value is
ignored**; you must call `res.send(...)` yourself. The response pipeline
(interceptors, serializers) is bypassed.

`@Res({ passthrough: true })` keeps NestJS in charge while still letting you
touch the response object — the pattern TaskFlow uses for cookies:

```ts
// backend/src/auth/auth.controller.ts (real)
@Post('login')
@HttpCode(HttpStatus.OK)
async login(
  @Body() loginDto: LoginDto,
  @Res({ passthrough: true }) res: Response,
) {
  ...
  return this.authService.login(user, res, ...); // sets cookies AND returns JSON
}
```

The auth service sets JWT cookies on `res`, and the return value still
becomes the response body. Both things happen.

And the *deliberate* non-passthrough case — binary downloads, where a JSON
serializer would corrupt the payload:

```ts
// backend/src/reports/reports.controller.ts (real)
@Get('export/project/:projectId')
async exportProjectReport(
  @Param('projectId', MongoIdValidationPipe) projectId: string,
  @CurrentUser('_id') currentUserId: string,
  @CurrentUser('role') currentUserRole: UserRole,
  @Res() res: Response,
) {
  const buffer = await this.exportService.exportProjectReport(
    projectId, currentUserId, currentUserRole,
  );

  res.set({
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename=project-${projectId}-report.xlsx`,
    'Content-Length': buffer.length,
  });

  res.send(buffer);
}
```

An Excel file cannot ride the JSON pipeline — so the controller correctly
takes full control of the response.

> **⚠️ Common mistake.** `@Res()` without `passthrough` on a normal JSON
> route "to set a header" — and the handler's return value silently
> disappears, and the response pipeline is skipped. TaskFlow's rule: cookies
> → passthrough; binary → raw `@Res()`; everything else → return values.

---

## 7.7 Route order — why `me` beats `:id`

NestJS matches routes **in the order they're declared**. A parameterized
route matches *any* value — so a literal route listed after it can never be
reached. TaskFlow is careful about this:

```ts
// backend/src/users/users.controller.ts (real)
@Get('me/login-history')        // literal route — declared FIRST
@Roles(UserRole.TEAM_MEMBER)
async getMyLoginHistory(...)

...

@Get(':id')                     // parameterized — matches anything
async findOne(@Param('id', MongoIdValidationPipe) id: string) { ... }
```

If `@Get(':id')` were declared first, `GET /users/me/login-history` would
match `:id` with `id = "me"` — and fail the `MongoIdValidationPipe` with a
confusing 400. The rule: **literal routes before parameterized routes,
always.**

The notifications controller shows the same discipline:

```ts
// backend/src/notifications/notifications.controller.ts (real)
@Get('unread-count')
@SkipThrottle()
async getUnreadCount(...)
```

> **❓ Interview question.** "`GET /users/me` stopped working after someone
> added `GET /users/:id`. Why?" — Route matching is declaration-order. The
> literal route must be declared before the parameterized one; otherwise
> `:id` swallows `me`.

---

## 7.8 Multiple controllers per module

A module can declare several controllers, each claiming different routes —
even with overlapping prefixes. The tasks feature has two controllers, one
for the resource itself and one for its dependency sub-resource:

```ts
// backend/src/tasks/tasks.module.ts (real)
controllers: [TasksController, TasksDependencyController],
```

```ts
// backend/src/tasks/tasks-dependency.controller.ts (real)
@Controller('tasks')
export class TasksDependencyController {
  @Post(':taskId/dependencies')
  @Roles(UserRole.PROJECT_MANAGER, UserRole.ADMIN)
  async addDependency(...)
  ...
}
```

Both controllers share the `tasks` prefix, and the URLs interleave cleanly:

```
TasksController                  TasksDependencyController
  POST   /tasks                   POST   /tasks/:taskId/dependencies
  GET    /tasks                   DELETE /tasks/:taskId/dependencies/:dependsOnTaskId
  GET    /tasks/:id               GET    /tasks/:taskId/blocking
  PATCH  /tasks/:id               GET    /tasks/:taskId/blocked
  PATCH  /tasks/:id/status
```

Splitting by *sub-resource* keeps each controller small and focused — same
module, same DI scope (Chapter 6), different concern.

The dashboard and search controllers show a second pattern: controllers that
don't own a feature module live in `common/` and are registered directly in
`AppModule`:

```ts
// backend/src/app.module.ts (real)
controllers: [SearchController, DashboardController],
```

---

## 7.9 The canonical TaskFlow controller

Every piece of this chapter composes into one shape. TaskFlow's
`CommentsController` — the most complete example — demonstrates the whole
vocabulary at once:

```ts
// backend/src/comments/comments.controller.ts (real, abridged)
@Controller('tasks/:taskId/comments')
@Roles(UserRole.PROJECT_MANAGER, UserRole.ADMIN, UserRole.TEAM_MEMBER)
export class CommentsController {
  constructor(
    private readonly commentsService: CommentsService,
    private readonly tasksService: TasksService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Param('taskId', MongoIdValidationPipe) taskId: string,
    @Body() createCommentDto: CreateCommentDto,
    @CurrentUser('_id') userId: string,
    @CurrentUser('role') userRole: UserRole,
  ) {
    // access control is delegated to the task service
    await this.tasksService.findById(taskId, userId, userRole);

    return this.commentsService.create(createCommentDto, taskId, userId);
  }
}
```

Read it left to right:

- `@Controller` — the URL prefix.
- Class-level `@Roles` — default access for every route in the class.
- Constructor — the services this controller delegates to (DI, Chapter 6).
- `@Post` + `@HttpCode` — verb and status.
- `@Param('taskId', pipe)` — the route's resource id, validated.
- `@Body()` — the DTO, validated before entry.
- `@CurrentUser('_id')` / `@CurrentUser('role')` — who's calling.
- Method body — access check, then exactly one service call, then return.

Every decorator in the book appears here. That's not a coincidence — it's
the reward of the thin-layer design: controllers are uniform because they're
simple, and they're simple because they do one thing.

---

## 7.10 Common mistakes

**1. Business logic in the controller.** Validation checks, DB queries,
permission logic, loops. The controller's contract is parse → delegate →
shape. If a handler is more than an access check plus one service call, the
extra work belongs in the service (Chapter 8).

**2. `@Res()` without `{ passthrough: true }` on a JSON route.** The return
value silently disappears and the response pipeline (interceptors,
serializers) is skipped. Use passthrough for cookies; raw `@Res()` only for
binary.

**3. A parameterized route before a literal route.** `@Get(':id')` declared
before `@Get('me')` swallows it. Literals first, always.

**4. Ids without `MongoIdValidationPipe`.** A malformed id reaches Mongo and
produces a 500 instead of a clean 400 (§7.4). Every TaskFlow `@Param('id')`
carries the pipe.

**5. `@Body('field')` where a DTO belongs.** Validating ten fields one by
one, by hand, in the controller. Multi-field payloads get a DTO; the pipe
does the validating.

**6. Query values used as numbers without transformation.** `?page=2`
arrives as `"2"`. The `PaginationDto`'s `@Type(() => Number)` is what makes
arithmetic and `@IsInt()` work — copy that pattern, don't skip it.

**7. Decorators without understanding the mechanism.** `@Roles` alone does
nothing; it just writes metadata. The guard reads it. If roles ever stop
being enforced, check that `RolesGuard` is still in `APP_GUARD` (Chapter 6
§6.4) — the decorator can't enforce anything by itself.

---

## Exercises

### 🟢 Concept

1. In one sentence each: what a controller does, what a service does, and why
   the line cannot blur.
2. `@Controller('tasks/:taskId/comments')` — write the four URLs
   `CommentsController` exposes.
3. What's the difference between `@Query()` and `@Query('limit')`? What does
   each bind to?
4. `@Roles` *writes* metadata. Who *reads* it, and what does
   `getAllAndOverride` check first — the class or the method?
5. What does `@Res()` (no passthrough) do to the handler's return value, and
   what pipeline is skipped with it?

### 🟡 Code

6. Write the `@Controller('teams')` endpoint `GET /api/teams/:id` from
   scratch: class decorator, method decorator, `@Param` with
   `MongoIdValidationPipe`, and `@CurrentUser('_id')`. Compare against the
   real `backend/src/teams/teams.controller.ts`.
7. In `backend/src/auth/auth.controller.ts`, list every decorator on the
   `login` method and explain what each one does — `@Public`, `@Throttle`,
   `@Post`, `@HttpCode`.

### 🔴 Debug

8. Someone reorders `UsersController` so `@Get(':id')` appears above
   `@Get('me/login-history')`. Hanna logs in and visits her history page —
   describe exactly what happens, which error she sees, and the one-line fix.
9. A teammate adds `@Res() res: Response` to `TasksController.findAll` "to
   set a header," and pagination requests start returning empty bodies.
   Explain why, and what the correct decorator is (`@Res({ passthrough:
   true })` or neither).

### ⚫ Mini-project

10. TaskFlow has no `GET /api/tasks/:id/detail` shortcut. Sketch three
    routes in `TasksController` that properly demonstrate: a literal route,
    a parameterized route, and a nested route — with valid `@Roles`,
    `@HttpCode`, id pipes, and `@CurrentUser`. Then write one paragraph
    justifying your `@Patch`-not-`@Put` choice for updates.

---

## Interview questions

1. "What does a controller do, and where does business logic live?" —
   Translates HTTP to typed calls; delegates to services. Logic lives in
   services, never controllers.
2. "What's the difference between `@Controller`, `@Get`, and `@Param`?" —
   `@Controller` declares the route prefix; `@Get` the verb + suffix; `@Param`
   extracts path segments. Decorators, defining three aspects of a route.
3. "How do `@Roles` and `RolesGuard` work together?" — `@Roles` writes
   metadata via `SetMetadata`; the global guard reads it at request time via
   `Reflector.getAllAndOverride`. Only metadata in; policy can live in one
   place.
4. "Why `@Public()`?" — NestJS's app-level guards are secure-by-default;
   `@Public()` marks the few routes (login, health) that skip JWT auth.
5. "What does `{ passthrough: true }` on `@Res()` mean?" — NestJS keeps
   the response pipeline (so return values still become the body), while the
   handler may touch headers/cookies. TaskFlow uses it for cookies and the
   raw `@Res()` for binary exports.
6. "How do you avoid the `:id` swallowing `me` problem?" — Declare literal
   routes before parameterized ones; route matching is declaration order.

---

## Key takeaways

1. **Controllers translate; they don't decide.** Parse → delegate → shape.
   Business logic and queries live below.
2. **Parameter decorators inject; metadata decorators declare.** `@Body`,
   `@Param`, `@Query`, `@Body` retrieve; `@Roles`, `@Public`, `@Throttle`
   are flags a guard reads.
3. **DTOs and pipes make the boundary safe.** Body validated against the
   DTO, ids validated by `MongoIdValidationPipe` — before the handler runs.
4. **Route order is declaration order.** Literals before `:params`, always.
5. **The escape hatches are narrow and deliberate.** `@CurrentUser` replaces
   `req.user` boilerplate; `@Res({ passthrough: true })` for cookies,
   raw `@Res()` only for binary.

## Further reading

- [NestJS — Controllers](https://docs.nestjs.com/controllers) — route
  parameters, query, body, status codes, `@Res` options.
- [NestJS — Custom decorators](https://docs.nestjs.com/custom-decorators) —
  both parameter decorators (`createParamDecorator`) and metadata decorators
  (`SetMetadata`), the two families this chapter uses.
- [NestJS — Request lifecycle](https://docs.nestjs.com/faq/request-lifecycle) —
  where guards, pipes, and the decorator-provoked response sit in order.
- [Express — routing](https://expressjs.com/en/guide/routing.html) — the
  underlying router NestJS's `@Get`/`@Post` compile to.
- Re-read Chapter 5's stage list with this chapter's vocabulary — every
  decorator you now understand was carrying one stage.

---

_In Chapter 8, we step down into the service layer — where TaskFlow draws
the line between business logic that belongs in a service and code that
belongs elsewhere._
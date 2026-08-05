# Chapter 5 — Request Lifecycle

> **Opening scenario.** Abebe, the project manager, clicks **Create task** on
> the TaskFlow dashboard. The browser sends `POST /api/tasks` with a JSON
> body. In the ~40 milliseconds before the response arrives, the request
> passes through: a TCP socket, a cookie parser, an HTTP framework, a
> bootstrap pipeline, two global guards, a validation pipe, a controller
> method with six decorators, a service method with five business rules, two
> repository queries, one database insert, a populated document, a typed
> event, an asynchronous listener, a second database write, a serializer —
> and then it all runs *backward* out to the browser.
>
> This chapter follows that one request through every file. By the end, you
> will know the TaskFlow backend better than its authors — because you will
> have walked it function by function.

Chapters 1–4 built the map. Chapter 1 traced the network path. Chapter 2
explained the runtime that executes it. Chapter 3 gave you the type system
that keeps it honest. Chapter 4 showed the architecture that organizes it.
Now we walk the **complete journey** — one request, every stop, every file,
every function, every decorator. This is the chapter the whole volume has been
pointing at.

**Learning objectives.** By the end of this chapter you will be able to:

- name every stage a request passes through, in order, in a NestJS app;
- explain what each global registration in `main.ts` and `app.module.ts` does
  to a request;
- decode the full decorator stack on `TasksController.create`;
- trace `POST /api/tasks` through the guard chain, the validation pipe, the
  controller, the service's five business rules, and the repository write;
- follow the event emission into the notification listener and its second
  database write;
- explain where and how errors become responses, via the global exception filter;
- and trace the response path back out — including the shape changes the
  document undergoes.

---

## 5.1 The full map, at a glance

Before the step-by-step, the complete pipeline for `POST /api/tasks`, with the
file responsible at every stage:

```
1.  TCP socket                  libuv / Node http          (Ch 1, 2)
2.  Express adapter             @nestjs/platform-express
3.  Cookie parser               cookie-parser              main.ts
4.  Global prefix              /api                         main.ts
5.  Route matching             TasksController             metadata
6.  Global guard #1            JwtAuthGuard                app.module.ts + jwt-auth.guard.ts
7.  Global guard #2            RolesGuard                  app.module.ts + roles.guard.ts
8.  Global pipe                ValidationPipe              main.ts
9.  Route handler              TasksController.create      tasks.controller.ts
10. Service                    TasksService.create         tasks.service.ts
11. Repository #1              ProjectsRepository.findById projects.repository.ts
12. Repository #2              UsersService.findById       users.service.ts (+ repo)
13. Repository #3              TasksRepository.create      tasks.repository.ts
14. Event emit                 EventEmitter2              tasks.service.ts
15. Event listener             NotificationListener       notification.listener.ts
16. Repository #4              NotificationsRepository.create
17. Response shaping           toObject() + Nest serializer
18. Exception filter (on error) AllExceptionsFilter       all-exceptions.filter.ts
```

Eighteen stages. Most of them run in well under a millisecond. Let's walk each
one — and every time we hit a file you've seen before, we go one level deeper
than the previous chapter did.

---

## 5.2 Stages 1–4: from socket to routing

### Stage 1 — the TCP socket

The browser opened a TCP connection to `localhost:3001` (§1.3). The bytes of
the HTTP request arrive in chunks, and libuv's poll phase hands them to Node's
HTTP parser. Nothing TaskFlow-specific happens here — but everything below
depends on this stage being fast, which is why Chapter 2's lesson matters:
if the event loop is blocked, these bytes sit unread.

### Stage 2 — the Express adapter

NestJS is a framework *around* Express (the `@nestjs/platform-express`
package). Express is the HTTP server: it parses the request line, headers,
and body, and builds the `req` and `res` objects. NestJS then layers its
guards, pipes, decorators, and DI on top. You rarely touch Express directly in
TaskFlow — except in a few places where the framework hands it through, like
`@Res({ passthrough: true })` in the auth controller (§1.6).

### Stage 3 — the cookie parser

Before routing, the middleware registered in `main.ts` runs. TaskFlow's one
piece of application middleware:

```ts
// backend/src/main.ts (real)
app.use(cookieParser());
```

`cookieParser()` reads the request's `Cookie` header and parses it into
`req.cookies`. For `POST /api/tasks` this matters because the browser sends
`Cookie: access_token=eyJhbGciOiJIUzI1NiJ9...` — and the auth guard needs that
value in the next stage. Without this middleware, `req.cookies.access_token`
would be `undefined` and every request would get a 401.

> **In the TaskFlow repo** — the `JwtStrategy` reads the cookie the parser
> produced (Chapter 14 covers it in depth):
>
> ```ts
> // backend/src/auth/strategies/jwt.strategy.ts (real)
> jwtFromRequest: ExtractJwt.fromExtractors([
>   (request) => request?.cookies?.access_token,               // primary: cookie
>   ExtractJwt.fromAuthHeaderAsBearerToken(),                  // fallback: header
> ]),
> ```

### Stage 4 — the global prefix

`main.ts` set the global prefix:

```ts
// backend/src/main.ts (real)
app.setGlobalPrefix('api');
```

The URL the browser sent was `http://localhost:3001/api/tasks`. Express
matches the path after stripping `/api` — so the route NestJS looks up is
`/tasks`, which belongs to `TasksController`. The prefix is invisible to the
controller; it's a deployment-level decision ("all API routes live under
/api") made in one line.

---

## 5.3 Stage 5: route matching — how `POST /tasks` finds `create`

NestJS builds a route table at boot from controller metadata. `TasksController`
declares:

```ts
// backend/src/tasks/tasks.controller.ts (real)
@Roles(UserRole.PROJECT_MANAGER, UserRole.ADMIN)
@Controller('tasks')
export class TasksController {
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() createTaskDto: CreateTaskDto,
    @CurrentUser() user: UserContext,
  ) { … }
}
```

The matching algorithm for `POST /tasks`:

1. **Path** — `/tasks` matches the `@Controller('tasks')` class-level path,
   combined with the method's `@Post()` (no sub-path) → `POST /tasks`.
2. **Method** — `POST` matches `@Post()`. A `GET /tasks` request would match
   the *other* method, `findAll` — same path, different handler.
3. **Decorator metadata** — the class carries `@Roles(PM, ADMIN)`, which the
   guard in stage 7 will read.

If no route matched, Nest would throw `NotFoundException` (404) — which the
global filter (§5.10) renders as a clean 404 response.

---

## 5.4 Stages 6–7: the guard chain — who may proceed

Both global guards are registered in `app.module.ts` as `APP_GUARD`s (Chapter
4 §4.6). They run in declaration order, **before** the handler:

```ts
// backend/src/app.module.ts (real)
providers: [
  { provide: APP_GUARD, useClass: JwtAuthGuard },
  { provide: APP_GUARD, useClass: RolesGuard },
  { provide: APP_FILTER, useClass: AllExceptionsFilter },
],
```

### Stage 6 — JwtAuthGuard: authentication

```ts
// backend/src/common/guards/jwt-auth.guard.ts (real)
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) { super(); }

  override canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }

  override handleRequest(err: any, user: any, info: any) {
    if (err || !user) {
      throw err || new UnauthorizedException(
        info?.message || 'Authentication required to access this resource',
      );
    }
    return user;
  }
}
```

Step by step for `POST /api/tasks`:

1. `canActivate` checks for `@Public()` metadata — `create` has none (only
   the auth routes do), so it proceeds to the Passport machinery.
2. `AuthGuard('jwt')` invokes the JWT strategy (§5.2): extract the token from
   the cookie, verify its signature and expiry, decode the payload
   (`{ sub, email, role, version }`).
3. The strategy's `validate(payload)` then loads the user from the database —
   *yes, a database query happens inside authentication* — and rejects
   deleted or deactivated accounts:
   ```ts
   // backend/src/auth/strategies/jwt.strategy.ts (real)
   async validate(payload: JwtPayload) {
     const { sub: userId } = payload;
     const user = await this.usersService.findById(userId);
     if (!user) throw new UnauthorizedException('User account no longer exists');
     if (user.status === UserStatus.INACTIVE) {
       throw new UnauthorizedException('Your user account has been deactivated…');
     }
     return user;   // Passport attaches this to request.user
   }
   ```
4. Back in `handleRequest`: user is present → returned → Passport sets
   `request.user` to the full user document.

If any of this fails — no token, bad signature, expired token, deleted user —
`handleRequest` throws `UnauthorizedException`, and the request **never
reaches the controller**. That's stage 6's contract: authentication is
all-or-nothing, and it happens before any business code runs.

### Stage 7 — RolesGuard: authorization

```ts
// backend/src/common/guards/roles.guard.ts (real, core logic)
const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
  ROLES_KEY,
  [context.getHandler(), context.getClass()],
);

if (!requiredRoles || requiredRoles.length === 0) return true;

const user = request.user as { userId: string; email: string; role: UserRole };

if (user?.role === UserRole.ADMIN) return true;

const hasRole = requiredRoles.some((role) => {
  if (role === UserRole.TEAM_MEMBER) {
    return user?.role === UserRole.TEAM_MEMBER || user?.role === UserRole.PROJECT_MANAGER;
  }
  if (role === UserRole.PROJECT_MANAGER) {
    return user?.role === UserRole.PROJECT_MANAGER;
  }
  return user?.role === role;
});

if (!hasRole) throw new ForbiddenException('Forbidden resource: insufficient role permissions');
```

For `POST /api/tasks`:

1. `Reflector` reads the `@Roles(PROJECT_MANAGER, ADMIN)` metadata — from the
   *class* (method has no `@Roles`, so `getAllAndOverride` falls through to
   the class level).
2. Abebe's role is `ProjectManager` → matches → **allowed, proceeds**.
3. Had Hanna (a Team Member) sent this request, the guard would throw
   `ForbiddenException` → 403 → the request dies here, before validation,
   before the controller, before any database write.

The two guards together answer the two questions from Chapter 1: **401 = who
are you?** (stage 6), **403 = I know you, but no** (stage 7).

> **Why this design?** Both guards run *globally* — every route in TaskFlow
> passes through them, so a new endpoint is authenticated and role-checked by
> default. Route authors must explicitly relax with `@Public()` (auth routes)
> or tighten with `@Roles(...)`. You cannot accidentally create an unguarded
> route; you can only deliberately exempt one. We return to this "secure by
> default" stance in Chapters 14–15.

---

## 5.5 Stage 8: the validation pipe — what the body may be

Now the request is authenticated and authorized. Next, NestJS applies the
**global pipe** before invoking the handler:

```ts
// backend/src/main.ts (real)
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
);
```

For `POST /api/tasks`, the `@Body() createTaskDto: CreateTaskDto` parameter
tells Nest which DTO to validate against. The pipe:

1. **`transform: true`** — deserializes the JSON body into a
   `CreateTaskDto` *class instance* (with prototype and methods).
2. **`whitelist: true`** — strips any property not declared on the DTO.
3. **`forbidNonWhitelisted: true`** — a body containing an undeclared field
   (say, `"status": "Done"` or `"isAdmin": true`) is **rejected with 400**,
   rather than silently stripped.
4. Runs every decorator on the DTO fields: `@IsNotEmpty`, `@IsString`,
   `@IsEnum(TaskPriority)`, `@IsDateString`, `@IsMongoId` — from
   `create-task.dto.ts` (Chapter 1 §1.9 quoted the full file).

A body like `{"title": 42}` fails `@IsString` → 400, before any service code.
A body like `{"title":"x","role":"Administrator"}` fails
`forbidNonWhitelisted` → 400. The pipe is the contract enforcement point:
**whatever the service receives, it receives validated.**

> **In the TaskFlow repo** — the same pipe also validates route and query
> parameters where declared. `findAll` uses a custom pipe on optional query
> params:
>
> ```ts
> // backend/src/tasks/tasks.controller.ts (real)
> async findAll(
>   @Query('project', ParseMongoIdPipe) projectId?: string,
>   @Query('assignee', ParseMongoIdPipe) assigneeId?: string,
>   @CurrentUser() user?: UserContext,
> ) { … }
> ```
>
> `ParseMongoIdPipe` (Chapter 3) returns a 400 for a malformed id *before* the
> repository ever sees it:
>
> ```ts
> // backend/src/common/pipes/parse-mongo-id.pipe.ts (real)
> if (!Types.ObjectId.isValid(value)) {
>   throw new BadRequestException(`Invalid Mongo ID format: "${value}"`);
> }
> ```

---

## 5.6 Stage 9: the controller — the decorator stack decoded

With the guards passed and the body validated, Nest invokes the handler. This
is the moment to decode the **entire decorator stack** on `create` — every
line, what it does to the request, and why it exists:

```ts
// backend/src/tasks/tasks.controller.ts (real)
@Roles(UserRole.PROJECT_MANAGER, UserRole.ADMIN)   // (1) class-level
@Controller('tasks')                               // (2) class-level
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}   // (3)

  @Post()                                            // (4) method
  @HttpCode(HttpStatus.CREATED)                      // (5) method
  async create(                                      // (6)
    @Body() createTaskDto: CreateTaskDto,            // (7) parameter
    @CurrentUser() user: UserContext,                // (8) parameter
  ) {
    return this.tasksService.create(createTaskDto, user._id.toString());
  }
}
```

Decoded, decorator by decorator:

1. **`@Roles(PROJECT_MANAGER, ADMIN)`** — class-level metadata read by
   `RolesGuard` (stage 7). Sets the *default* access rule for every route in
   the controller. Method-level `@Roles` would override it per-route.
2. **`@Controller('tasks')`** — registers the class as a controller and binds
   the path prefix `/tasks`.
3. **Constructor** — DI (Chapter 4 §4.5): Nest injects the `TasksService`
   singleton. The controller is thin — one dependency, one responsibility.
4. **`@Post()`** — binds the method to `POST /tasks`.
5. **`@HttpCode(HttpStatus.CREATED)`** — overrides the default `200` with
   `201 Created`, the semantically correct code for resource creation (§1.4).
6. **`async create(...)`** — the handler itself. `async` means it returns a
   promise; Nest awaits it and serializes the resolved value.
7. **`@Body() createTaskDto: CreateTaskDto`** — the *parameter decorator*:
   "give me the request body, validated and transformed into a
   `CreateTaskDto`." The `ValidationPipe` from stage 8 runs because of this
   annotation.
8. **`@CurrentUser() user: UserContext`** — the custom parameter decorator
   (Chapter 3 §3.7): "give me the user that JwtAuthGuard attached to the
   request." `request.user` was set in stage 6; `@CurrentUser()` reads it.

The entire method body is one line: `return this.tasksService.create(...)`,
passing the DTO and the actor's id (`user._id.toString()`). Everything about
HTTP — status codes, bodies, headers — has been handled by decorators and the
framework. The controller's *only* job is to connect the HTTP world to the
service world.

> **⚠️ Common mistake.** Putting logic in the controller. If you find yourself
> writing `if`/`for`/database calls in a controller method, you're smuggling
> service work into the wrong layer (Chapter 4 §4.3). The controller's one-line
> handoff is the pattern: parse, delegate, return.

---

## 5.7 Stages 10–13: the service — where the business happens

Now the request is inside `TasksService.create`. This is the longest stage —
five business rules, each with its own reason (most are SRS/BR requirements),
then the persistence, then the events.

```ts
// backend/src/tasks/tasks.service.ts (real, the create method)
async create(createTaskDto: CreateTaskDto, actorId: string) {
  const project = await this.projectsRepository.findById(createTaskDto.project);
  if (!project) {
    throw new NotFoundException('Project not found');
  }
  // … (business rules 1–3)
  const memberIds = [project.ownerId, ...project.memberIds];
  if (!memberIds.includes(createTaskDto.assignee)) {
    throw new BadRequestException(
      'Task can only be assigned to users who are members of the project',
    );
  }
  const dueDate = new Date(createTaskDto.dueDate);
  if (dueDate < project.startDate || dueDate > project.endDate) {
    throw new BadRequestException(
      'Task due date must fall within the project start and end dates',
    );
  }

  const taskData: any = {
    title: createTaskDto.title,
    description: createTaskDto.description,
    priority: createTaskDto.priority,
    dueDate,
    project: new Types.ObjectId(createTaskDto.project),
    assignee: new Types.ObjectId(createTaskDto.assignee),
    createdBy: new Types.ObjectId(actorId),
  };

  const task = await this.tasksRepository.create(taskData);

  this.eventEmitter.emit(
    TaskAssignedEvent.eventName,
    new TaskAssignedEvent(
      task._id.toString(),
      createTaskDto.assignee,
      createTaskDto.title,
      actorId,
    ),
  );

  await this.notifyUrgentDeadlineIfDue(
    task._id.toString(),
    task.title,
    task.assigneeId,
    task.status,
    task.dueDate,
  );

  return task.toObject();
}
```

### Business rule 1 — the project exists

`ProjectsRepository.findById(createTaskDto.project)` — a *repository* call,
crossing from service layer into the data layer. The repository populates the
owner and members (§5.8 explains what that means for the response). If the
project id doesn't match a document → `NotFoundException` → 404.

### Business rule 2 — the assignee exists

`UsersService.findById(createTaskDto.assignee)` — a *cross-feature* call
through the exported service (Chapter 4's module boundary). Missing user →
404.

### Business rule 3 — the assignee is a member (BR-003)

```ts
const memberIds = [project.ownerId, ...project.memberIds];
if (!memberIds.includes(createTaskDto.assignee)) {
  throw new BadRequestException(
    'Task can only be assigned to users who are members of the project',
  );
}
```

This is the rule from the SRS — tasks are assignable only to project members.
Note the *types* doing work: `ownerId` and `memberIds` are the stable id
shapes from Chapter 3 §3.10 — strings, comparable with `includes`. A year
ago this line was the `ref?._id?.toString()` bug farm; now it's typed and
safe.

### Business rule 4 — the due date is in range (BR-006)

```ts
const dueDate = new Date(createTaskDto.dueDate);
if (dueDate < project.startDate || dueDate > project.endDate) {
  throw new BadRequestException(
    'Task due date must fall within the project start and end dates',
  );
}
```

A task's deadline may not fall outside its project's planned dates. This is
the kind of rule that only lives in a service layer — nowhere else in the
stack has the *context* (the project's dates) to check it.

### Business rule 5 — the actor is recorded

```ts
createdBy: new Types.ObjectId(actorId),
```

Every task records who created it — a data-integrity requirement (BR-005's
audit-trail family). The actor came from `@CurrentUser()` in the controller
and is threaded through (Chapter 19's actor-attribution work).

### Stage 12 — the repository write

```ts
// backend/src/tasks/tasks.repository.ts (real)
async create(data: Partial<Task>): Promise<TaskDocument> {
  const task = new this.taskModel(data);
  return task.save();
}
```

`new this.taskModel(data)` constructs an in-memory document; `.save()`
executes the insert. Mongoose applies the schema's defaults (`status: 'To Do'`,
`priority: 'Medium'`), adds `createdAt`/`updatedAt` (timestamps), and the
document returns up the stack — now a full `TaskDocument` with the stable
`assigneeId` virtual (§3.10).

### Stages 13–15 — the events fire

Still inside the service, after the write:

1. **`TaskAssignedEvent` emitted** — synchronously, the listener starts
   (§2.9). The notification is created asynchronously — this request's
   response does *not* wait for it.
2. **`notifyUrgentDeadlineIfDue`** — the shared urgent-deadline check
   (FR-008.3): if the new task is due within 24 hours, it emits
   `TaskDeadlineUrgentEvent` and sets the dedup flag.

### Stage 16 — the listener's second database write

```ts
// backend/src/notifications/listeners/notification.listener.ts (real)
@OnEvent(TaskAssignedEvent.eventName)
async handleTaskAssigned(event: TaskAssignedEvent) {
  await this.notificationsRepository.create({
    recipient: event.assigneeId,
    type: NotificationType.TASK_ASSIGNED,
    message: `You have been assigned to task: "${event.taskTitle}"`,
    task: event.taskId,
    sender: event.assignedBy,
  });
}
```

A notification document is inserted for the assignee. The request that
triggered it is already on its way back to the browser — the event seam
(Chapter 18) made the side effect asynchronous by design.

---

## 5.8 What `findById` and populate do to the shape

Stage 11's `ProjectsRepository.findById` deserves its own note, because it
changes the *shape* of the data the service sees:

```ts
// backend/src/projects/projects.repository.ts (real)
async findById(id: string): Promise<ProjectDocument | null> {
  return this.projectModel
    .findById(id)
    .populate('owner', '-passwordHash')
    .populate('members', '-passwordHash')
    .populate('teams', 'name description')
    .exec();
}
```

`populate('owner', …)` replaces the raw `owner` ObjectId with the *embedded
user document* (minus password hash). This is why the stable-id virtuals from
Chapter 3 matter: after populate, `project.owner` is a document, and
`project.ownerId` (the virtual) is the id — the service uses `ownerId`, never
touching the populated blob. The virtual is the bridge between the two shapes.

> **Why this design?** Populate happens at the *repository* — the seam closest
> to the database — so the rest of the app sees display-ready data without
> knowing or caring whether a ref is populated. The cost: populate is a join,
> and joins cost queries. Chapter 26 (Performance) shows where TaskFlow
> deliberately avoids it (the `.lean()` dashboard query).

---

## 5.9 Stage 17: the response path — back out

The service returns `task.toObject()` — the Mongoose document converted to a
plain object, with the stable virtuals included. The return value flows back
up the stack:

```
TasksService.create → TasksController.create → Nest serialization → Express → socket
```

Three transformations happen on the way out:

1. **`toObject()`** — document → plain object (methods stripped, virtuals
   evaluated).
2. **Nest's serializer** — the object is JSON-serialized into the response
   body. `@HttpCode(HttpStatus.CREATED)` (stage 9) sets the status to 201.
3. **Express writes** — the status line, headers, and JSON body are written to
   the TCP socket. The browser's axios promise resolves with the new task.

One subtlety worth noting: the *controller's return value* and the *wire
payload* are the same object here — no response DTO or interceptor reshapes
it. TaskFlow deliberately keeps the read paths simple (interceptors don't
exist in the codebase — confirmed by a full scan). The shaping that *does*
happen — `select('-passwordHash')`, `toObject()`, the `omit` of the hash in
auth — happens in repositories and services, closer to the data.

> **In the TaskFlow repo** — the shape-control points, all verified:
> - `users.repository.ts`: `.select('-passwordHash')` on every read.
> - `auth.service.ts`: `const { passwordHash: _, ...userWithoutPassword } = userObject;`
> - `tasks.repository.ts`: `.lean()` + `.select('title status dueDate project')` for the dashboard.

---

## 5.10 Stage 18: when something goes wrong — the exception filter

Every `throw` we've seen — `NotFoundException`, `BadRequestException`,
`UnauthorizedException`, `ForbiddenException` — is a **`HttpException`**, and
Nest's default handling would render it with its status code. But TaskFlow
adds a global filter to catch what Nest's defaults get *wrong* — Mongoose
errors that would otherwise surface as raw 500s:

```ts
// backend/src/common/filters/all-exceptions.filter.ts (real)
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    // Nest's own HTTP exceptions keep their status codes
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      const body = typeof res === 'string' ? { statusCode: status, message: res } : res;
      response.status(status).json(body);
      return;
    }

    const mapped = this.mapMongooseError(exception);
    if (mapped) {
      response.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        message: mapped,
        error: 'Bad Request',
      });
      return;
    }

    // Unknown — log, sanitized 500
    console.error('Unhandled exception:', exception);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    });
  }
}
```

For `POST /api/tasks`, three paths through this filter:

1. **Business-rule throws** — e.g. `new BadRequestException('Task can only be
   assigned to users who are members of the project')` → 400 with that
   message. The filter passes `HttpException`s straight through.
2. **A bad id reaching MongoDB** — if a `Types.ObjectId` cast fails inside a
   repository, Mongoose throws `CastError`/`BSONError`, which Nest would
   render as a 500. The filter's `mapMongooseError` maps it to a clean 400:
   `Invalid value for field "project"`. This is the filter's real value — it
   normalizes *database* errors into *client* errors with honest messages.
3. **Anything else** — logged to the console, returned as a sanitized 500 that
   never leaks internals (no stack traces, no file paths, no env vars — a
   security decision we revisit in Chapter 25).

> **Why this design?** A global `APP_FILTER` means *every* error in the app
> funnels through one decision point (Chapter 4 §4.6's composition-root
> principle). Route authors throw meaningful exceptions; the filter owns the
> HTTP rendering. The alternative — try/catch in every service method —
> scatters the same logic across dozens of files and inevitably drifts.

---

## 5.11 The whole journey, annotated with times

Put it together. For a healthy `POST /api/tasks` by a PM:

```
 0.0ms  TCP bytes arrive (libuv poll phase)
 0.1ms  Express parses request line + headers
 0.2ms  cookieParser → req.cookies.access_token
 0.2ms  /api prefix stripped; route /tasks matched to TasksController
 0.3ms  JwtAuthGuard: cookie → strategy → verify signature → load user (query #1)
 1.0ms  RolesGuard: role ProjectManager ∈ [PM, ADMIN] → allow
 1.1ms  ValidationPipe: body → CreateTaskDto, all decorators pass
 1.2ms  create(): project lookup (query #2) → 404? no
 1.5ms  assignee lookup (query #3) → 404? no
 1.6ms  membership check → pass; due-date range → pass
 1.8ms  TasksRepository.create → insert (query #4) → document
 1.9ms  emit TaskAssignedEvent → listener starts (async, query #5 pending)
 2.0ms  notifyUrgentDeadlineIfDue → due in >24h? no emit
 2.1ms  toObject() → return
 2.2ms  Nest serializes JSON, 201 Created
 2.3ms  Express writes response to socket
~3-6ms (background)  listener inserts the notification document
```

One request, five database queries (one inside authentication, two for the
business rules, one insert, one background notification write), five business
rules, two guards, one pipe, six decorators, eighteen named stages — and the
browser sees `201` in a few milliseconds. That is the request lifecycle. Know
it, and you know the backend.

---

## 5.12 Common mistakes

**1. Forgetting middleware order.** `cookieParser()` runs before guards — if
it were registered after, `req.cookies` would be empty and every request would
401. Middleware order is part of the contract.

**2. Expecting the controller to be the right place for business rules.** The
service is where validation-of-context (project dates, membership) lives. A
rule in the controller can't be tested without an HTTP layer.

**3. Relying on Nest's default error handling for Mongoose errors.** Without
`AllExceptionsFilter`, a bad ObjectId in a query is a 500 with a stack trace.
The filter maps it to a 400 — and leaks nothing.

**4. Treating `@Public()` as "secure enough."** `@Public()` skips *auth*
only — `RolesGuard` still runs. But public routes have no user; any handler
that then calls `@CurrentUser()` unguarded gets `null` (§3.7's decorator
returns null). Check, or fail closed.

**5. Blocking the response on side effects.** The notification write is
deliberately asynchronous via the event seam. If you `await` the listener's
work inline in the service, you've re-coupled the response to the
notification's health (Chapter 18).

**6. Believing the response is "raw."** Documents are transformed three times
on the way out (toObject, serialization, shaping). Never assume what the
browser receives is byte-identical to the document — read the repository's
`select()` and the service's destructuring.

---

## Exercises

### 🟢 Concept

1. List the eighteen stages of the `POST /api/tasks` lifecycle from §5.1, in
   order, without looking.
2. What is the difference between what `JwtAuthGuard` decides and what
   `RolesGuard` decides? Which status code does each throw?
3. Where does the `ValidationPipe` run relative to the guards? Why does the
   order matter (what would a malformed body do if the pipe ran *after* the
   handler)?
4. Name the three things `@CurrentUser() user: UserContext` does — how the
   value gets onto the request, how the decorator reads it, and what the type
   guarantees.
5. Why is the notification created after `task.toObject()` has been returned —
   and what would break if the service `await`ed it inline?

### 🟡 Code

6. Open `backend/src/tasks/tasks.service.ts` and count the business rules in
   `create`. For each, name the exception it throws and the HTTP status that
   exception produces.
7. Trace `PATCH /api/tasks/:id/status` the same way: which guard checks the
   role? Which DTO validates the body? Which service method runs the state
   machine (`VALID_TRANSITIONS`)? Which repository method writes?
8. In `backend/src/auth/auth.controller.ts`, the login route is `@Public()`.
   Explain what would happen to `POST /api/auth/login` if `@Public()` were
   removed (think: stage 6, then the 401).

### 🔴 Debug

9. A new route `DELETE /api/tasks/:id` returns 403 for a Project Manager.
   List the files you'd open, in order, to find whether the problem is role
   metadata, the guard chain, or something else — and what you'd look for in
   each.

### ⚫ Mini-project

10. Draw your own lifecycle diagram for `GET /api/tasks` (the *list* route):
    write down the stages that are identical to `POST /api/tasks` and the
    ones that differ (query pipes on `?project=`, the visibility policy in
    the service, `findByProjectIds`, no events). This diagram is your study
    sheet for Part II.

---

## Interview questions

1. "Walk me through what happens when a request hits your NestJS app." — This
   chapter is the answer: middleware → global guards (auth then roles) →
   global pipe (validation) → controller → service → repository → response,
   with the exception filter catching failures. Name the TaskFlow files.
2. "How do guards, pipes, and interceptors differ?" — Guards run first
   (authorization, before the handler); pipes transform/validate arguments;
   interceptors wrap handler execution (TaskFlow uses none, deliberately).
   Order: guards → interceptors (pre) → pipes → handler → interceptors
   (post) → filter.
3. "Where do you enforce business rules?" — In the service layer, never the
   controller. Give TaskFlow's membership and due-date rules as examples.
4. "Why would you put a database query inside authentication?" — The JWT
   strategy loads the user to reject deleted/deactivated accounts — a
   stateless token can't know the user was deactivated after it was signed.
5. "How do you turn a database error into a clean 400?" — A global exception
   filter that maps Mongoose `CastError`/`ValidationError`/`BSONError` to
   sanitized 400s (TaskFlow's `AllExceptionsFilter`).
6. "What's the difference between 401 and 403 in your app, precisely?" — 401:
   `JwtAuthGuard` failed (no/invalid token). 403: `RolesGuard` or
   `ProjectMemberGuard` rejected a valid user (wrong role / not a member).

---

## Key takeaways

1. **One request, eighteen stages, three layers of infrastructure.** The
   framework does most of the work before your code ever runs — understand
   the pipeline and you understand the app.
2. **Guards gate, pipes shape, services decide, repositories persist.** Each
   stage has exactly one job, and the order is fixed by NestJS: auth → roles →
   validation → handler → business → data → events → response.
3. **Authentication is a database query.** The JWT strategy validates the
   token *and* re-loads the user — the only way to reject accounts deactivated
   after signing.
4. **Errors are a pipeline too.** Every throw funnels into `AllExceptionsFilter`
   — 400 for bad input and bad ids, 4xx preserved, 500 sanitized.
5. **Side effects run after the response path starts.** Events make
   notifications asynchronous by design — the request's health never depends
   on the notification's health.

## Further reading

- [NestJS — Request Lifecycle](https://docs.nestjs.com/faq/request-lifecycle) —
  the official ordering of middleware, guards, interceptors, pipes, and
  filters.
- [NestJS — Guards, Pipes, Exception Filters](https://docs.nestjs.com/guards) —
  the three mechanism families this chapter exercised.
- Re-read Chapter 1 §1.10 — you now know, at function level, everything that
  diagram compressed into nine steps.

---

*In Chapter 6, we zoom into the machinery behind the scenes: dependency
injection — the container, resolution, scopes, and how Nest decides what a
constructor means.*

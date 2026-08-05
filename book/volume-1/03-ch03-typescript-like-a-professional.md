# Chapter 3 — TypeScript Like a Professional

> **Opening scenario.** A TaskFlow notification is mysteriously not being
> created. Hanna comments on a task, and Abebe — the assignee — never gets
> alerted. The team stares at the code. The event payload looks right. The
> listener looks right. The repository call looks right.
>
> The bug: `comment.author` is a *populated document*, and someone called
> `.toString()` on it — which returns an inspect blob like
> `{ _id: new ObjectId('...'), content: '...', ... }`, not the id. The
> notification repository then tried to cast that garbage into an ObjectId,
> the cast failed, and the notification silently never persisted. For weeks,
> the fix was copy-pasted as `ref?._id?.toString() ?? ref?.toString()` at
> fourteen call sites — a band-aid at each wound, never a cure.
>
> This chapter is about the tool that turns that class of bug — "the shape
> of my data is not what I think it is" — from a runtime mystery into a
> compile-time error: **TypeScript**.

Chapter 1 gave you the network. Chapter 2 gave you the runtime. This chapter
gives you the *language* — the type system that lets TaskFlow's authors encode
their domain rules directly into the compiler. When you finish, you will not
just read TypeScript; you will understand the decisions behind every type
annotation in the codebase, and you will be able to write types that *prevent*
bugs instead of documenting code that has them.

**Learning objectives.** By the end of this chapter you will be able to:

- explain why TaskFlow uses TypeScript at all, and what "strict" buys you;
- read and write enums, unions, and literal types modeled on TaskFlow's domain;
- explain structural typing with real TaskFlow interfaces;
- use generics the way the repository pattern does;
- use utility types (`Partial`, `Pick`, `Omit`, `Record`, `Required`) and
  explain why `UpdateTaskDto` is handwritten instead of using `PartialType`;
- use `keyof` and indexed access, exactly as `@CurrentUser` does;
- explain `infer` and conditional types, including what `Awaited<ReturnType<…>>`
  is doing in TaskFlow's controller types;
- trace the `refId` seam and the typed event contracts — the two places where
  TaskFlow's types catch real bugs at compile time;
- and read a professional `tsconfig.json` line by line.

---

## 3.1 Why TypeScript — types as contracts

JavaScript is dynamically typed: `const x = something()` — what is `x`? At
runtime, whatever it happens to be. That flexibility is why JavaScript took
over the world, and it is also why large JavaScript codebases rot: a function
that takes "a user" will happily accept "a project", "a string", or
`undefined`, and the failure surfaces *later* — often in production, often at
3 a.m.

TypeScript adds a **static type system** on top of JavaScript. "Static" means
the checking happens at *compile time*, before any code runs. The compiler
reads your annotations and your code, and if a value flows somewhere it
shouldn't, the build fails — with a message pointing at the exact line.

The metaphor that matters: **types are contracts.** When TaskFlow writes:

```ts
// backend/src/users/schemas/user.schema.ts (real)
export type UserDocument = HydratedDocument<User>;
```

it is writing a contract: "this value is a full Mongoose user document — an
object with `firstName`, `email`, `.save()`, `.toObject()`, and so on." Every
function that accepts a `UserDocument` is a party to that contract. If someone
tries to pass a plain string where a `UserDocument` is expected, the compiler
refuses to build the program.

> **Why this design?** Why not just "be careful"? Because the whole point of a
> type system is to move mistakes from *runtime* (where they cost outages) to
> *compile time* (where they cost a few seconds). TaskFlow is ~10,000 lines of
> TypeScript across 30+ files, with 197 tests — and the type system is a
> second, always-on test suite that runs on every save. Chapter 24 (honest
> tests) returns to this: types catch the bugs tests forgot to write, and
> tests catch the bugs types can't express.

### The two kinds of typing

There are two philosophies of type systems:

- **Nominal typing** (Java, C#): two types are equal only if they have the
  same *name*. `class User` and `class Account` with identical fields are
  different types.
- **Structural typing** (TypeScript): two types are compatible if they have
  the same *shape*. If you have an object with `firstName`, `lastName`,
  `email`, and `role`, it *is* a user for TypeScript's purposes, even if no
  class named `User` ever saw it.

Structural typing is TypeScript's superpower and its trap — and it is the
engine behind every `interface` in TaskFlow. We return to it in §3.3.

---

## 3.2 Types, enums, unions, and literals — TaskFlow's vocabulary

Every TaskFlow domain concept has a type. Reading them is reading the domain's
dictionary.

### Enums: a fixed set of named values

An **enum** declares a type whose values are a fixed, named set. TaskFlow's
domain is full of them:

```ts
// backend/src/tasks/schemas/task.schema.ts (real)
export enum TaskStatus {
  TODO = 'To Do',
  IN_PROGRESS = 'In Progress',
  DONE = 'Done',
}

export enum TaskPriority {
  HIGH = 'High',
  MEDIUM = 'Medium',
  LOW = 'Low',
}
```

```ts
// backend/src/users/schemas/user.schema.ts (real)
export enum UserRole {
  ADMIN = 'Administrator',
  PROJECT_MANAGER = 'ProjectManager',
  TEAM_MEMBER = 'TeamMember',
}

export enum UserStatus {
  ACTIVE = 'Active',
  INACTIVE = 'Inactive',
}
```

Notice the values are *strings*, not numbers. That is a deliberate choice:
when a task document travels to MongoDB and back as JSON, its `status` is the
readable string `'In Progress'`, not an opaque `1`. String enums give you
**self-describing data** — a database dump is readable by humans, and API
clients see meaningful values.

> **⚠️ Common mistake.** Using numeric enums without realizing they're
> numbers. `enum Status { TODO, DONE }` gives `TODO === 0`, `DONE === 1` —
> and your database ends up full of `0` and `1` that mean nothing to anyone.
> TaskFlow's string enums avoid this entirely.

### Literal types and unions

A **literal type** is a type with exactly one value: `'To Do'`. A **union**
combines types: `'To Do' | 'In Progress' | 'Done'`. An enum is essentially a
named union of literals. You can also write unions directly, without an enum —
and TaskFlow's JWT payload type shows both styles meeting:

```ts
// backend/src/auth/strategies/jwt.strategy.ts (real)
export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  /** Refresh-token rotation counter — used to reject revoked tokens. */
  version?: number;
}
```

The token's `role` is typed as a plain `string`, even though the user's role
is a `UserRole` enum — because a JWT payload is *decoded data* that arrives
from a signed token, not from the database. The strategy verifies the
signature, and the guards (Chapter 14) decide what the `role` string may do.
This is a deliberate looseness at an untrusted boundary, contrasted with the
*guarded* places (schemas, DTOs) where the enum is enforced. Knowing where a
codebase chooses `string` over an enum — and why — is part of reading types
professionally.

> **In the TaskFlow repo** — the frontend declares the same role union with
> plain literals, showing the two styles side by side:
>
> ```ts
> // frontend/contexts/AuthContext.tsx (real)
> export interface User {
>   _id: string;
>   firstName: string;
>   lastName: string;
>   email: string;
>   role: 'Administrator' | 'ProjectManager' | 'TeamMember';
>   status: 'Active' | 'Inactive';
> }
> ```
>
> Same contract, two spellings. The backend centralizes in an enum (so guards
> and schemas share it); the frontend inlines literals (it only consumes the
> values). Both are correct TypeScript — the choice is about where the truth
> lives.

### The `null`/`undefined` distinction

In TypeScript (with `strictNullChecks` on — TaskFlow has it), `null` and
`undefined` are distinct, and neither is assignable to a type that doesn't
include it. TaskFlow's schemas lean on this: a task's `createdBy` may simply
not exist yet.

```ts
// backend/src/tasks/schemas/task.schema.ts (real)
@Prop({ type: SchemaTypes.ObjectId, ref: 'User' })
createdBy?: Types.ObjectId | null;
```

`createdBy?: ...` means "may be `undefined`"; `| null` adds the database's
explicit null. The type documents reality: this field is optional *and* can be
explicitly null — two different states that runtime code must handle
differently.

---

## 3.3 Interfaces and structural typing

An **interface** describes the shape of an object: its properties and their
types. TaskFlow uses interfaces for contracts across module boundaries — the
DTOs your API accepts, the inputs your repository expects, the shape of
`request.user`.

### The notification contract

The cleanest example is the shared notification input — the contract between
the event listener and the repository:

```ts
// backend/src/notifications/schemas/notification.schema.ts (real)
export interface CreateNotificationInput {
  recipient: string;
  type: NotificationType;
  message: string;
  task?: string;
  comment?: string;
  sender?: string;
}
```

Three things this interface encodes:

1. `recipient`, `type`, `message` are **required** — no notification without them.
2. `task`, `comment`, `sender` are **optional** (`?`) — present only when
   relevant. A deadline-urgent alert has no sender (§3.10); a comment
   notification has a comment id.
3. Ids are **strings at this boundary** — the repository converts them to
   ObjectIds. This is the typed seam that makes the "who casts what" question
   moot.

### Structural typing in action

Here is where structural typing pays off. The `RolesGuard` doesn't care about
the *class* of `request.user`; it cares that the object has a `role`:

```ts
// backend/src/common/guards/roles.guard.ts (real, abridged)
const user = request.user as {
  userId: string;
  email: string;
  role: UserRole;
};
if (user?.role === UserRole.ADMIN) return true;
```

And the tasks controller defines the minimum shape it needs:

```ts
// backend/src/tasks/tasks.controller.ts (real)
type UserContext = { _id: { toString(): string }; role?: UserRole };
```

`JwtAuthGuard` attaches a full `UserDocument` to `request.user`; the controller
accepts it as a `UserContext` because a `UserDocument` *has* `_id` (with
`toString`) and `role`. No inheritance, no casts of the wrong kind — the shapes
just line up. That is structural typing: **if it walks like a duck and quacks
like a duck, it's a `UserContext`.**

> **Why this design?** Interfaces-plus-structural-typing is what lets TaskFlow
> share types across layers *without* a shared "types" package: the auth
> module defines `UserRole`, the guards import it, the controllers define
> minimal local shapes, and everything type-checks because the shapes agree.
> The cost — two types with the same fields are silently interchangeable — is
> real, and Chapter 24 discusses when that bites. The benefit — no ceremony,
> no coupling — is why TaskFlow uses it everywhere.

### Interface vs. type alias

`interface` and `type` are largely interchangeable for object shapes; the
practical differences (interfaces can be merged and extended; type aliases can
express unions and mapped types) rarely matter in TaskFlow's code. The codebase
uses `interface` for object contracts and `type` for unions and combinations —
a reasonable, consistent convention:

```ts
// backend/src/tasks/schemas/task.schema.ts (real)
export interface TaskDocumentRefs {
  assigneeId: string | null;
}

export type TaskDocument = HydratedDocument<Task> & TaskDocumentRefs;
```

The `type` combines two things — the hydrated Mongoose document *and* the
extra `assigneeId` surface — with an **intersection** (`&`). We return to this
exact type in §3.10, because it is the seam that fixed the opening scenario's
bug.

---

## 3.4 Classes and decorators — how NestJS works

TypeScript classes are JavaScript classes with type annotations — but NestJS's
entire idiom is built on **decorators**: functions that attach metadata to
classes, methods, and parameters. (Chapter 2 §2.10 unmasked them; here we see
the types around them.)

```ts
// backend/src/users/users.service.ts (real)
@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}
}
```

`@Injectable()` marks the class as a provider the DI container can construct.
`private readonly usersRepository: UsersRepository` declares a constructor
parameter, stores it as a property, *and* types it — three things in one
line. This is the idiomatic NestJS pattern you will see in every service:

```ts
constructor(
  private readonly tasksRepository: TasksRepository,
  private readonly projectsRepository: ProjectsRepository,
  private readonly usersService: UsersService,
  private readonly visibilityPolicy: VisibilityPolicyService,
  private readonly eventEmitter: EventEmitter2,
) {}
```

Every parameter's *type* is the DI container's lookup key: it finds a provider
of type `TasksRepository` and injects it. The types are not documentation here
— they are the *wiring*. Delete a type and the app fails at boot.

### `readonly`

The `readonly` modifier means: "this property can be assigned exactly once —
in the constructor." After that, the compiler rejects any reassignment. It
prevents a whole class of accidental mutation bugs: a service that reassigns
its repository halfway through is a service that behaves differently on every
request.

> **❓ Interview question.** "What does `private readonly` on a constructor
> parameter do?" — Three things: declares the parameter, stores it as a
> private property, and prevents reassignment. NestJS's DI relies on the
> *type* of the parameter to resolve the dependency.

---

## 3.5 Generics — code that works with any type

A **generic** is a function, class, or type that works with *many* types while
staying type-safe. Instead of `Promise<any>` or `Promise<Object>`, you write
`Promise<T>` — a promise that resolves to whatever type `T` you supply.

TaskFlow's repositories are saturated with generics. The signature of every
Mongoose operation:

```ts
// backend/src/users/users.repository.ts (real)
async findByEmail(email: string): Promise<UserDocument | null> {
  return this.userModel.findOne({ email: email.toLowerCase() }).exec();
}
```

Read the pieces:

- `Promise<UserDocument | null>` — "an async operation that eventually yields
  either a user document or nothing." The `Promise<T>` generic captures the
  resolved type.
- `Model<UserDocument>` — the model is generic over the document type it
  produces. `this.userModel.findOne(...)` returns `Query<UserDocument | null>`,
  whose `.exec()` gives the promise.

And the create methods show the input side:

```ts
// backend/src/tasks/tasks.repository.ts (real)
async create(data: Partial<Task>): Promise<TaskDocument> {
  const task = new this.taskModel(data);
  return task.save();
}
```

`Partial<Task>` — a generic that makes every property of `Task` optional — is
the first utility type we meet, and we devote §3.6 to the family. Here, it
says: "the repository accepts a task-shaped object where any field may be
missing; it returns a complete `TaskDocument`." The input is loose, the output
is strict — exactly the right direction for a persistence seam.

### Writing your own generic

TaskFlow doesn't hand-write many generics (Mongoose and NestJS supply them),
but you must be able to read them — and write them when you need them. The
shape:

```ts
function first<T>(items: T[]): T | undefined {
  return items[0];
}
```

`<T>` declares a type variable; `T` appears in the parameter type (`T[]`) and
the return type (`T | undefined`). Call it with an array of tasks, and `T`
is inferred as `Task`:

```ts
const firstTask = first(tasks); // Task | undefined
```

> **⚠️ Common mistake.** Reaching for `any` when you can't immediately express
> the type. `any` turns the type checker off for that value — the bug from the
> opening scenario sailed through because somewhere a value was `any` and the
> compiler had nothing to check. Prefer `unknown` (see §3.9) when you truly
> don't know the shape, and narrow it with a check.

---

## 3.6 Utility types — transforming types

TypeScript ships a toolbox of **utility types**: generic types that *transform*
other types. They are the "functions" of the type system — take a type, return
a new one. Four matter daily in TaskFlow.

### `Partial<T>` — all properties optional

```ts
type Partial<T> = { [P in keyof T]?: T[P] };
```

(Mapped type — we decode that syntax in §3.8.) `Partial<Task>` is a task where
every field may be absent. This is the repository's universal input type:

```ts
// backend/src/users/users.repository.ts (real)
async update(id: string, data: Partial<User>): Promise<UserDocument | null> {
  return this.userModel.findByIdAndUpdate(id, data, { new: true, runValidators: true })
    .select('-passwordHash')
    .exec();
}
```

`Partial<User>` means "some subset of a user's fields" — exactly what a
partial update needs. Notice the elegance: `User` (the full type) and
`Partial<User>` (the update input) are *derived from the same source*; if a
field is added to `User`, both sides update automatically.

### `Pick<T, K>` and `Omit<T, K>` — subsetting

- `Pick<User, 'firstName' | 'email'>` — a user reduced to just those two fields.
- `Omit<User, 'passwordHash'>` — a user with `passwordHash` removed.

TaskFlow does this *at runtime* (destructuring) everywhere it must not leak the
hash:

```ts
// backend/src/auth/auth.service.ts (real)
const userObject = user.toObject();
const { passwordHash: _, ...userWithoutPassword } = userObject;
return userWithoutPassword;
```

The runtime destructuring is the *implementation*; `Omit<User, 'passwordHash'>`
is the *type* you could write for the result. The repository layer enforces the
same rule at the query level:

```ts
// backend/src/users/users.repository.ts (real)
async findAll(): Promise<UserDocument[]> {
  return this.userModel.find().select('-passwordHash').exec();
}
```

Three layers (query projection, runtime destructure, and — in principle — the
`Omit` type) all enforcing one rule: **the password hash never leaves the
service layer.**

> **In the TaskFlow repo** — a real `Omit`-style need shows up in the reports
> service's dashboard typing, where the projection is declared inline:
>
> ```ts
> // backend/src/tasks/tasks.repository.ts (real)
> async findForDashboard(projectIds: Types.ObjectId[]): Promise<
>   {
>     _id: Types.ObjectId;
>     title: string;
>     status: TaskStatus;
>     dueDate: Date;
>     project: Types.ObjectId;
>   }[]
> > { … }
> ```
>
> That's a hand-written "dashboard-shaped task" — a deliberate subset of the
> full task. With `Pick<Task, '_id' | 'title' | 'status' | 'dueDate' | 'project'>`
> the same intent would be *derived* from `Task` instead of duplicated.
> The codebase hand-writes it; the type system could do better. This is the
> kind of observation a professional makes: not "it's wrong," but "here is
> the refactor."

### `Record<K, V>` — a dictionary type

`Record<K, V>` builds an object type whose keys are of type `K` and whose
values are of type `V`. TaskFlow uses it for the single most important
business rule in the tasks domain — the **state machine**:

```ts
// backend/src/tasks/dto/update-task-status.dto.ts (real)
const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  [TaskStatus.TODO]: [TaskStatus.IN_PROGRESS],
  [TaskStatus.IN_PROGRESS]: [TaskStatus.TODO, TaskStatus.DONE],
  [TaskStatus.DONE]: [TaskStatus.IN_PROGRESS],
};
```

Read it: "a dictionary keyed by every task status, whose values are arrays of
task statuses." The compiler *enforces* two things:

1. **Every status must appear as a key** — you cannot write a transition map
   that forgets `DONE`, because `Record<TaskStatus, …>` requires all three keys.
2. **Values must be arrays of `TaskStatus`** — you cannot accidentally write
   `[TaskStatus.TODO, 'Sideways']`.

This is the type system encoding a *business rule* (the status machine from
Chapter 5's state-machine diagrams). A typo in the transition table is now a
compile error, not a silent `undefined` at runtime.

### `Required<T>` and the rest of the family

- `Required<T>` — all properties mandatory (the inverse of `Partial`).
- `Readonly<T>` — all properties read-only.
- `NonNullable<T>` — removes `null` and `undefined` from a union.

TaskFlow mostly uses `Partial`, `Record`, and the hand-rolled versions of
`Pick`/`Omit` — but the family is worth knowing because library types (and
interview questions) use them constantly.

### The `PartialType` question — what the book must be honest about

`@nestjs/mapped-types` offers `PartialType(CreateTaskDto)`: a DTO that
*derives* an update DTO from a create DTO, making every field optional while
inheriting all validation decorators. It is the canonical NestJS way to write
an update DTO:

```ts
// The canonical NestJS approach — NOT what TaskFlow does
export class UpdateTaskDto extends PartialType(CreateTaskDto) {}
```

**TaskFlow does not use it.** Every update DTO in the codebase is handwritten
with `@IsOptional()` on each field:

```ts
// backend/src/tasks/dto/update-task.dto.ts (real)
export class UpdateTaskDto {
  @IsOptional()
  @IsString({ message: 'Title must be a string' })
  title?: string;

  @IsOptional()
  @IsString({ message: 'Description must be a string' })
  description?: string;

  @IsOptional()
  @IsEnum(TaskPriority, {
    message: `Priority must be one of: ${Object.values(TaskPriority).join(', ')}`,
  })
  priority?: TaskPriority;

  @IsOptional()
  @IsDateString({}, { message: 'Due date must be a valid date' })
  dueDate?: string;

  @IsOptional()
  @IsMongoId({ message: 'Assignee must be a valid Mongo ID' })
  assignee?: string;
}
```

Why? Compare the two and you see the trade:

- **`PartialType`** — DRY, but it inherits `CreateTaskDto`'s *required* fields
  and makes them optional *wholesale*. In TaskFlow's case it would also
  inherit `project` and `assignee` — fields that *shouldn't* be updatable the
  same way (project changes go through the project route; the create DTO's
  `project` isn't a valid update at all). And the create DTO's `@IsNotEmpty`
  on `title` would be inherited but weakened to optional — subtle semantics
  that hide intent.
- **Handwritten** — explicit about *which* fields are updatable (note: no
  `project`, no `status` — status has its own route), explicit about *how*
  each is validated, and self-documenting. The cost is repetition.

For a book teaching *production* TypeScript, the honest lesson is: the
handwritten DTO is the *deliberate* choice here, and it's defensible — the
update surface differs from the create surface in kind, not just in
optionality. Knowing `PartialType` lets you recognize when a codebase *could*
use it; knowing why TaskFlow doesn't lets you make the call yourself.

---

## 3.7 `keyof` and indexed access

`keyof T` is a type operator that produces the *union of property names* of
`T`. If `User` has `firstName`, `lastName`, `email`, then `keyof User` is
`'firstName' | 'lastName' | 'email'`.

TaskFlow uses it in exactly one place, and it's the perfect example — the
`@CurrentUser` decorator:

```ts
// backend/src/common/decorators/current-user.decorator.ts (real)
export const CurrentUser = createParamDecorator(
  (data: keyof UserDocument | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;

    if (!user) return null;

    return data ? user[data] : user;
  },
);
```

`data: keyof UserDocument | undefined` — "the argument may be the name of any
property a user document has, or nothing." The compiler then *knows* that
`user[data]` is a valid access (no `noImplicitAny` complaint), because `data`
is guaranteed to be a real property name. This is why these calls type-check:

```ts
@CurrentUser() user              // whole document
@CurrentUser('_id') userId       // the _id property — keyof guarantees it exists
```

If someone wrote `@CurrentUser('passwrod')` — typo and all — the compiler would
reject it: `'passwrod'` is not in `keyof UserDocument`. A runtime `undefined`
becomes a build error.

**Indexed access** `T[K]` looks up the type of a property. The pair powers the
utility types from §3.6 — `Partial<T>`'s `T[P]` is indexed access, and
`keyof T` supplies `P`. Together:

```ts
type Role = User['role'];          // UserRole — the type of the role property
type Name = User['firstName'];     // string
```

> **Why this design?** Decorators that accept property names are a classic
> foot-gun: at runtime, a typo just yields `undefined`. `keyof` moves that
> failure to compile time — the same pattern as the enum keys in
> `VALID_TRANSITIONS`, and the same philosophy everywhere in this chapter:
> *let the compiler hold the invariants*.

---

## 3.8 `typeof` and mapped types

### `typeof` — the type of a value

`typeof x` (in *type position*) produces the type of the value `x`. It is how
you reuse a type without naming it. TaskFlow's controllers use it to derive a
handler's view type from the service's actual return type — no duplication:

```ts
// backend/src/tasks/tasks.controller.ts (real)
type TaskView = Awaited<ReturnType<TasksService['findById']>>;
```

`TasksService['findById']` is *indexed access on the class* — the type of the
`findById` method. `ReturnType<…>` extracts its return type (we decode that in
§3.9). `Awaited<…>` unwraps the promise. The result: `TaskView` is exactly
what `findById` returns — automatically, without ever writing the shape by
hand. If the service changes its return type, `TaskView` changes with it, and
every consumer re-checks. This is `typeof`-driven, `keyof`-driven type
derivation at its best: **the controller's view type can never drift from the
service's actual return type.**

### Mapped types — transforming every property

A **mapped type** iterates over the keys of a type and builds a new type:

```ts
type Mutable<T> = { -readonly [P in keyof T]: T[P] };   // strip readonly
type Nullable<T> = { [P in keyof T]: T[P] | null };     // allow null everywhere
```

`Partial<T>` is itself a mapped type: `{ [P in keyof T]?: T[P] }`. TaskFlow
doesn't write many mapped types by hand, but it *consumes* them constantly
(the entire utility-type family is mapped types), and the frontend uses them
in real UI code. Knowing the syntax means `Partial`, `Record`, and friends stop
being magic.

---

## 3.9 `infer`, conditional types, and `unknown`

Now the deep end — the types that make TypeScript's type system *computable*,
not just declarative.

### Conditional types

A **conditional type** is a type-level `if`:

```ts
type IsString<T> = T extends string ? true : false;
// IsString<'hi'> === true, IsString<number> === false
```

`T extends string ? A : B` reads: "if `T` is assignable to `string`, the type
is `A`; otherwise `B`."

### `infer` — pattern-matching inside a type

`infer` declares a type variable *inside* a conditional — it's how you extract
a piece of a type by pattern. The standard library's `ReturnType` is built
from it:

```ts
type ReturnType<T> = T extends (...args: any[]) => infer R ? R : any;
```

Read it: "if `T` is a function type, capture its return type as `R` and use
that; otherwise `any`." The `infer R` is the pattern-match: "whatever the
return type is, name it `R`."

Similarly `Awaited<T>` unwraps promises recursively:

```ts
type Awaited<T> = T extends Promise<infer U> ? Awaited<U> : T;
// Awaited<Promise<Promise<Task>>> === Task
```

### Decoding TaskFlow's `TaskView`

Now the controller type from §3.8 is fully readable:

```ts
type TaskView = Awaited<ReturnType<TasksService['findById']>>;
```

Working outward:

1. `TasksService['findById']` — indexed access: the type of the method —
   whatever `findById`'s signature is (an async method returning a promise).
2. `ReturnType<…>` — via `infer`: the method's return type, the promise.
3. `Awaited<…>` — via `infer`: the promise's resolved value — the task
   object shape the service actually returns.

So `TaskView` is "the task object `findById` actually returns," derived from
the service rather than duplicated in the controller. The `infer` keyword is
what makes that derivation possible.

### `unknown` — the honest "I don't know"

`unknown` is the type-safe cousin of `any`: "some value of unknown shape —
you must narrow it before using it." TaskFlow's `refId` helper — the seam from
the opening scenario — is built on exactly this discipline:

```ts
// backend/src/common/ref-id.ts (real)
export function refId(ref: unknown): string | null {
  if (ref == null) return null;

  const candidate = ref as { _id?: unknown } | null;
  const id = candidate?._id;

  if (id != null) {
    return typeof id === 'string' ? id : (id as { toString(): string }).toString();
  }

  return typeof ref === 'string' ? ref : (ref as { toString(): string }).toString();
}
```

The function accepts `unknown` — "I genuinely don't know whether this is a
populated document, a raw ObjectId, or a string" — and then *narrows* with
runtime checks: `ref == null` (guard), `candidate?._id` (shape probe),
`typeof id === 'string'` (narrowing). Each cast is a *local, justified* claim
after a runtime check — the opposite of an `any` that silences checks
everywhere.

> **❓ Interview question.** "`any` vs `unknown`?" — `any` disables type
> checking entirely; `unknown` requires you to narrow before use. `unknown`
> is the honest choice for values whose shape you don't know yet; `any` is
> almost always a bug in disguise.

---

## 3.10 Type safety in practice — the two seams that fixed real bugs

This chapter's thesis is that types prevent bugs. TaskFlow has two artifacts
that prove it — both born from the opening scenario, both worth studying line
by line.

### Seam 1: the `refId` stable-id surface

The bug: populated refs vs. raw ObjectIds had different `.toString()`
behavior, so ids silently became garbage. The fix has two parts.

**Part A — a single helper** (`refId`) that knows both shapes (§3.9's code).

**Part B — typed virtuals on every schema**, so consumers get a *stable
property* (`assigneeId`, `authorId`, `ownerId`, `memberIds`) instead of
reaching into refs themselves:

```ts
// backend/src/tasks/schemas/task.schema.ts (real)
export interface TaskDocumentRefs {
  assigneeId: string | null;
}

export type TaskDocument = HydratedDocument<Task> & TaskDocumentRefs;

// …schema definition…

TaskSchema.virtual('assigneeId').get(function (this: TaskDocument) {
  return refId(this.assignee);
});
```

The `& TaskDocumentRefs` intersection means: **any code holding a
`TaskDocument` has an `assigneeId` property, typed `string | null`.** The old
copy-pasted pattern — `ref?._id?.toString() ?? ref?.toString()` at fourteen
call sites — is gone; there is now one typed property with one implementation.
The call sites read cleanly:

```ts
// backend/src/tasks/tasks.service.ts (real)
const assigneeId = task.assigneeId;          // string | null — typed, stable
```

And the same seam carries through the projects and comments schemas:

```ts
// backend/src/projects/schemas/project.schema.ts (real)
export interface ProjectDocumentRefs {
  ownerId: string | null;
  memberIds: string[];
}

ProjectSchema.virtual('memberIds').get(function (this: ProjectDocument) {
  return this.members
    .map((member) => refId(member))
    .filter((id): id is string => id !== null);
});
```

Notice the **type predicate** — `.filter((id): id is string => id !== null)`.
This is a type-level guarantee that the result contains no nulls: the filter's
output type is `string[]`, not `(string | null)[]`. The predicate is the
bridge between the runtime check and the static type — exactly the "narrow and
prove" discipline of §3.9.

> **Why this design?** Two candidate designs were weighed: fix the helper at
> each call site (the old band-aid, proven to rot) or centralize the *shape*
> in the schema via typed virtuals (what shipped). The virtual is the deeper
> seam: it makes the stable shape a *property of the document type itself*,
> so the type system enforces the fix everywhere, and new call sites get it
> for free. Chapter 9 (Repositories) and Chapter 19 (Architecture Evolution)
> tell the full story.

### Seam 2: the typed event contracts

The notification events are classes whose *shape* is the contract between
emitters and listeners (first met in Chapter 2 §2.9). The typing is what makes
them compile-time-safe:

```ts
// backend/src/notifications/events/task-assigned.event.ts (real)
export class TaskAssignedEvent {
  static readonly eventName = 'task.assigned';

  constructor(
    public readonly taskId: string,
    public readonly assigneeId: string,
    public readonly taskTitle: string,
    public readonly assignedBy: string,
  ) {}
}
```

Two deliberate type decisions:

1. **`assignedBy` is required.** Every assignment has an authenticated actor
   (the controller passes `user._id.toString()`). By making the field
   non-optional, the *un-representable* bug — "a task assignment event without
   an actor" — cannot be written. The compiler enforces the business rule
   "every user-triggered event carries a sender" (Chapter 19's actor
   attribution work).

2. **`static readonly eventName`** — a string constant shared by emitter and
   listener. `@OnEvent(TaskAssignedEvent.eventName)` and
   `eventEmitter.emit(TaskAssignedEvent.eventName, …)` reference the *same*
   typed value, so a misspelled event name is a compile error, not a silent
   no-op.

Compare with the honest counterexample — the one event that *must* stay
senderless:

```ts
// backend/src/notifications/events/task-deadline-urgent.event.ts (real)
export class TaskDeadlineUrgentEvent {
  static readonly eventName = 'task.deadline-urgent';

  constructor(
    public readonly taskId: string,
    public readonly taskTitle: string,
    public readonly assigneeId: string,
    public readonly dueDate: Date,
    public readonly hoursRemaining: number,
  ) {}
}
```

No actor field at all — because this event comes from the cron, not from a
human. The *absence* of the field is a type-level statement about the domain:
system-generated alerts have no sender. The type system isn't just catching
bugs here; it's **encoding the domain model**.

---

## 3.11 A professional `tsconfig.json`

The type system only works if the compiler is configured to enforce it.
TaskFlow's `tsconfig.json` is a real production configuration — let's read the
settings that matter:

```json
// backend/tsconfig.json (real, abridged to the load-bearing settings)
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "strictNullChecks": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "esModuleInterop": true,
    "declaration": true,
    "sourceMap": true,
    "outDir": "./dist",
    "skipLibCheck": true
  }
}
```

Setting by setting:

- **`target: "ES2023"`** — the JavaScript version emitted. Modern Node (20+)
  supports ES2023 natively, so no down-transpiling is needed.
- **`module` / `moduleResolution: "nodenext"`** — how imports resolve under
  modern Node's ESM/CJS interop.
- **`strictNullChecks: true`** — *the* setting that makes `null`/`undefined`
  distinct (§3.2). With it off, half of this chapter's guarantees vanish.
- **`experimentalDecorators` + `emitDecoratorMetadata: true`** — NestJS's
  foundation: decorators for `@Injectable()`/`@Controller()`, and emitted
  metadata so the DI container can read constructor parameter *types* at
  runtime. Without these two, NestJS's dependency injection cannot work —
  the type in `constructor(private readonly repo: Repo)` is erased at runtime,
  and `emitDecoratorMetadata` is what preserves it.
- **`esModuleInterop: true`** — sane default-import behavior for CommonJS
  modules like `bcrypt` and `cookie-parser`.
- **`declaration: true`** — emit `.d.ts` files (for library consumers).
- **`sourceMap: true`** — debug in the original TypeScript, not compiled JS.
- **`outDir: "./dist"`** — compiled output, which `npm run start:prod` runs.

> **⚠️ Common mistake.** Copying a tsconfig without understanding it — the
> classic being `strictNullChecks` mysteriously off, or `noImplicitAny`
> disabled (TaskFlow's config sets `noImplicitAny: false`, a pragmatic
> compromise that lets legacy-shaped code through while keeping the
> null-safety guarantees). A professional knows *which* strictness matters for
> their codebase and why.

---

## 3.12 Common mistakes

**1. Using `any` to make errors go away.** `any` doesn't fix the bug; it
unplugs the detector. The opening scenario's bug lived in exactly this kind of
untyped shadow. Prefer `unknown` + narrowing (§3.9).

**2. Calling `.toString()` on a value of unknown shape.** Populated documents
don't stringify to their id. The `refId` seam exists because of this — use the
typed virtuals (`assigneeId`, `authorId`, `ownerId`, `memberIds`), never raw
`ref?.toString()`.

**3. Redefining the same domain type in every file.** Chapter 1 showed the
frontend redeclaring `User` in four files. The backend avoids this by
centralizing enums in schemas and deriving view types with
`Awaited<ReturnType<…>>`. Duplicated types are drift waiting to happen.

**4. Making update DTOs `PartialType` without checking the update surface.**
`PartialType` inherits everything — including fields that shouldn't be
updatable. TaskFlow's handwritten `UpdateTaskDto` is the deliberate
alternative; choose consciously.

**5. Forgetting `readonly` on injected dependencies.** A service that
reassigns its repository will misbehave subtly. `private readonly` is
idiomatic for a reason.

**6. Ignoring type predicates.** `.filter((x) => x !== null)` does *not*
narrow the result type — you need `(x): x is string => …` (or the non-null
assertion) for the compiler to know the nulls are gone.

---

## Exercises

### 🟢 Concept

1. Explain structural typing in one sentence, and give a TaskFlow example
   where a type is accepted because of its *shape*, not its name.
2. What is the difference between `any` and `unknown`? Which one does `refId`
   accept, and why?
3. Why are TaskFlow's enums strings rather than numbers? What does that
   decision buy at the database and API layers?
4. What does `Record<TaskStatus, TaskStatus[]>` guarantee at compile time
   that a plain object literal doesn't?

### 🟡 Code

5. Open `backend/src/tasks/dto/update-task.dto.ts` and `create-task.dto.ts`.
   List which fields the create DTO has that the update DTO omits, and
   explain *why* (hint: think about `project` and `status`).
6. In `backend/src/common/decorators/current-user.decorator.ts`, the parameter
   is `data: keyof UserDocument | undefined`. What happens at compile time if
   a controller calls `@CurrentUser('passwrod')`? (Try it in a scratch file if
   you like.)
7. Write the `Omit` version of the dashboard projection type in §3.6:
   `type DashboardTask = Pick<Task, '_id' | 'title' | 'status' | 'dueDate' | 'project'>`.
   Compare it with the hand-written inline type in
   `backend/src/tasks/tasks.repository.ts`. Which would you ship, and why?

### 🔴 Debug

8. A notification for a task reassignment is never created. The listener
   logs the event, but the repository call fails with a CastError. Using
   §3.10's seams, name the three places you would check and what you'd look
   for in each.

### ⚫ Mini-project

9. Add a typed virtual to a schema that doesn't have one yet (e.g. a
   `teamOwnerId` on a Team schema), following the `assigneeId` pattern:
   declare the refs interface, extend the document type, and add the virtual
   using `refId`. Run `npm run build` and confirm it compiles.

---

## Interview questions

1. "What's the difference between an interface and a type in TypeScript?"
   — Both describe shapes; interfaces can be merged/extended, types can
   express unions and mapped types. TaskFlow uses interfaces for object
   contracts and types for combinations.
2. "What is `keyof` used for?" — Producing the union of a type's property
   names; `@CurrentUser('_id')` type-checks because the argument must be a
   real property name.
3. "Explain `infer` in a conditional type." — It pattern-matches a piece of a
   type; `ReturnType<T>` and `Awaited<T>` are built from it.
4. "What is a mapped type? Give an example." — Transforming every property of
   a type; `Partial<T> = { [P in keyof T]?: T[P] }`.
5. "`Partial`, `Pick`, `Omit`, `Record` — when do you use each?" — Partial
   for update inputs; Pick/Omit for subsets; Record for keyed dictionaries
   like the status transition table.
6. "How does the type system prevent the notification sender bug?" — The
   event contract makes `assignedBy` required, so an actorless event is
   un-representable; the `refId` virtuals make id extraction typed.
7. "What does `strictNullChecks` do, and why does it matter?" — Makes
   `null`/`undefined` distinct and unassignable where not allowed; without
   it, half of the type system's guarantees disappear.
8. "Why does NestJS need `emitDecoratorMetadata`?" — The DI container reads
   constructor parameter *types* at runtime to resolve dependencies;
   decorator metadata is how those types survive compilation.

---

## Key takeaways

1. **Types are contracts, and contracts move bugs to compile time.** Every
   enum, interface, and generic in TaskFlow is a promise the compiler
   enforces on every save.
2. **Enums and unions encode the domain.** `TaskStatus`, `UserRole`,
   `VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]>` — business rules
   typed so a typo cannot compile.
3. **Utility types transform types.** `Partial`, `Pick`, `Omit`, `Record` are
   the type-system's functions — and choosing *not* to use `PartialType`
   where the update surface differs is a professional decision, not an
   oversight.
4. **`keyof`, `infer`, and conditional types make types computable.**
   `Awaited<ReturnType<TasksService['findById']>>` derives a view type from
   the service itself, so types can never drift.
5. **The seams are the proof.** The `refId` virtuals and the typed event
   contracts exist because real bugs happened — and the type system now makes
   those exact bugs un-representable. That is TypeScript's real value: not
   prettier code, but *fewer production incidents*.

## Further reading

- *Programming TypeScript* — Boris Cherny. The best single book on the type
  system; chapters on generics and conditional types are essential.
- [TypeScript Handbook — Utility Types](https://www.typescriptlang.org/docs/handbook/utility-types.html) —
  the official reference for `Partial`/`Pick`/`Omit`/`Record` and friends.
- [TypeScript Handbook — Type Manipulation](https://www.typescriptlang.org/docs/handbook/2/types-from-types.html) —
  `keyof`, `typeof`, indexed access, mapped and conditional types, `infer`.
- *Effective TypeScript* — Dan Vanderkam. Item-by-item professional practice;
  "prefer `unknown` to `any`" and the null-checking items are must-reads.

---

*Part I is complete: you understand the network (Chapter 1), the runtime
(Chapter 2), and the language (Chapter 3). In Part II we climb into NestJS —
starting with why the framework exists, and how it organizes the chaos of a
production backend into modules, providers, and layers.*

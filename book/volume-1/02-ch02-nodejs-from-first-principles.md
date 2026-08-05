# Chapter 2 — Node.js from First Principles

> **Opening scenario.** It is 9:41 on a Monday. Sixty-three requests hit the
> TaskFlow API in the same second — Hanna checking her dashboard, Abebe
> assigning a task, a cron scanning for urgent deadlines. One process, one
> thread, one JavaScript engine is handling all of it: reading from MongoDB,
> hashing passwords, signing tokens, serializing JSON, and answering hundreds
> of network connections — *apparently all at the same time*.
>
> It is not magic, and it is not parallelism. It is an event loop: a
> single-threaded runtime that never waits. This chapter is about what that
> means — what V8 is, how the event loop actually cycles, why promises and
> microtasks behave the way they do, what streams are for, and how NestJS —
> the framework TaskFlow is built on — is itself just Node.js wearing a
> costume.

This is not "how to use Express." Plenty of tutorials teach you the *what* —
write a route, call a function — and stop. This chapter teaches the *why*: the
machine model underneath every line of NestJS code you write. When you
understand the event loop, three things happen at once:

1. **Performance bugs stop being mysterious.** You will know exactly why a
   `JSON.stringify` of a huge task list freezes every request, and what to do
   about it.
2. **Concurrency starts making sense.** Promises, `await`, `setTimeout`,
   `process.nextTick` — the order of execution stops being a guessing game.
3. **Frameworks demystify.** NestJS's dependency injection, decorators, and
   event system are all ordinary JavaScript features, orchestrated by an
   ordinary Node.js process.

**Learning objectives.** By the end of this chapter you will be able to:

- explain what Node.js actually is (V8 + libuv) and what each part does;
- draw the event loop and trace a TaskFlow request through its phases;
- explain the single-threaded truth — what blocks the loop and what doesn't;
- convert a callback chain to promises to `async/await`, using real TaskFlow code;
- predict execution order in programs mixing promises, `setTimeout`, and `nextTick`;
- explain what streams are, why they exist, and why TaskFlow's reports return JSON instead of streamed PDFs;
- explain how Node's `EventEmitter` powers NestJS's event-driven notifications;
- and unmask NestJS — showing that decorators, providers, and DI are plain JavaScript.

---

## 2.1 What Node.js actually is

Node.js is not a language. JavaScript is the language; Node.js is a **runtime**
— a program that executes JavaScript outside a browser. And Node.js the runtime
is exactly two big pieces bolted together:

```
┌────────────────────────────────────────────────────────┐
│                    YOUR CODE                            │
│        (TasksService, controllers, repositories…)       │
├────────────────────────────────────────────────────────┤
│   Node.js standard library  (http, fs, crypto, path…)   │
├──────────────────────┬─────────────────────────────────┤
│        V8             │          libuv                  │
│  compiles & runs      │  event loop, thread pool,       │
│  your JavaScript      │  timers, I/O, networking        │
├──────────────────────┴─────────────────────────────────┤
│              Operating system (Windows/macOS/Linux)      │
└────────────────────────────────────────────────────────┘
```

**V8** is Google's JavaScript engine — the same one inside Chrome. It takes
your TypeScript-compiled JavaScript and turns it into machine code that the CPU
can actually execute (§2.2).

**libuv** is the C library that gives Node its superpower: the **event loop**
and the **thread pool**. It is responsible for timers, networking, file
system access, and the machinery that lets a single thread handle thousands of
concurrent connections (§2.3–§2.4).

One line of TaskFlow code illustrates the split perfectly. When you write:

```ts
// backend/src/tasks/tasks.repository.ts
async create(data: Partial<Task>): Promise<TaskDocument> {
  const task = new this.taskModel(data);
  return task.save();
}
```

`new this.taskModel(data)` constructs an in-memory object — pure V8, pure
JavaScript. `task.save()` hands work to the MongoDB driver, which hands the
actual network I/O to libuv, which eventually tells V8 "done, here's the
result." The `await` in your code is the seam where JavaScript meets the
outside world.

> **Why this design?** Why not just run JavaScript on the bare OS? Because V8
> is a *language engine*, not an operating system — it has no idea how to open
> a TCP socket or read a file. libuv is the adapter between the language and
> the OS. Learning to see this seam — "JavaScript here, I/O there" — is the
> foundation of everything else in this chapter.

**The `process` object.** Node exposes the runtime to your code through a
global object called `process`. In TaskFlow, the backend reads its port from
the environment via `process.env`:

```ts
// backend/src/main.ts
const port = process.env.PORT ?? 3000;
await app.listen(port);
```

`process.env.PORT` is Node reading an OS-level environment variable — your
first real contact with the fact that your code runs inside a host, not in a
vacuum.

---

## 2.2 V8 — the engine

V8's job: take JavaScript source, compile it to machine code, run it, and
manage the memory it uses. It does this with a pipeline that matters for one
reason: **performance comes from observing how your code actually runs.**

### Ignition + TurboFan: two-tier compilation

V8 does not compile your code once. It compiles it twice:

1. **Ignition** — a fast interpreter that starts running your code almost
   immediately, gathering *runtime feedback* (which functions are hot, what
   types flow through them).
2. **TurboFan** — an optimizing compiler that takes the hottest functions and
   compiles them into highly optimized machine code, *specialized to the types
   it observed*.

This is why V8 is called a **JIT (Just-In-Time)** compiler: compilation happens
at runtime, not ahead of time. And it explains a famous V8 behavior — **the
hidden class and inline-cache** — that has a real TaskFlow consequence:

```ts
// backend/src/tasks/tasks.repository.ts
const task = new this.taskModel(data);
```

Every `new Task()` creates an object with the *same shape* (same property
order: `title`, `description`, `priority`, …). V8 notices that all Task
documents share a shape, assigns them a hidden class, and optimizes property
access to a single indexed load. Objects of *different* shapes — say, mixing
`Task` and `User` in the same hot loop — defeat this optimization. The lesson
for a NestJS developer: **keep the shapes of objects you create in hot paths
consistent.** A task document that sometimes has `completedAt` and sometimes
doesn't, or that mutates properties after creation, quietly costs you
performance.

### Garbage collection

V8 allocates JavaScript objects in a heap and reclaims them with a
**garbage collector (GC)**. The heap is divided into generations:

- **Young generation** — short-lived objects (temporary variables, intermediate
  results). Collected frequently and cheaply.
- **Old generation** — objects that survived several collections. Collected
  rarely and expensively.

The practical consequence for a server: every object you allocate must be
collected later, and collection *pauses the thread* (§2.4 explains why that's
expensive). Allocating a 10,000-item array per request because you built a
report in memory means the GC runs constantly. TaskFlow's repository layer has
a specific defense for this — the **lean projection** in the dashboard query,
which returns only the fields the dashboard renders, allocating far fewer and
smaller objects:

```ts
// backend/src/tasks/tasks.repository.ts
async findForDashboard(projectIds: Types.ObjectId[]) {
  return this.taskModel
    .find({ project: { $in: projectIds } })
    .select('title status dueDate project')
    .lean<{ _id: Types.ObjectId; title: string; status: TaskStatus; dueDate: Date; project: Types.ObjectId }[]>()
    .exec();
}
```

`.lean()` returns plain JSON objects instead of full Mongoose documents —
cheaper to allocate, cheaper to collect, faster to serialize. You will meet
this again in Chapter 11 and Chapter 26 (Performance).

> **Interview question.** "What is a JIT compiler?" Answer in one breath:
> a compiler that runs at runtime, using observed execution data to optimize
> hot code paths. V8's Ignition interprets first, TurboFan optimizes the hot
> functions, and the hidden-class system makes property access fast.

---

## 2.3 The event loop, phase by phase

Now the centerpiece. The **event loop** is libuv's main loop: a single thread
that cycles through phases, each phase draining a queue of pending work. Node's
documentation defines the phases as:

```
   ┌───────────────────────────┐
┌─►│           timers          │  ← setTimeout / setInterval callbacks due now
│  └─────────────┬─────────────┘
│  ┌─────────────┴─────────────┐
│  │     pending callbacks     │  ← I/O callbacks deferred to the next cycle
│  └─────────────┬─────────────┘
│  ┌─────────────┴─────────────┐
│  │ idle, prepare             │  ← internal use
│  └─────────────┬─────────────┘
│  ┌─────────────┴─────────────┐
│  │           poll            │  ← retrieve new I/O events; execute I/O callbacks
│  └─────────────┬─────────────┘
│  ┌─────────────┴─────────────┐
│  │           check           │  ← setImmediate callbacks
│  └─────────────┬─────────────┘
│  ┌─────────────┴─────────────┐
│  │      close callbacks      │  ← socket.on('close', …)
│  └─────────────┬─────────────┘
└────────────────┴──────────────┘
```

Five of these phases matter to an application developer:

1. **Timers** — callbacks scheduled by `setTimeout()` and `setInterval()` whose
   delay has elapsed. "Due now" is the key phrase: `setTimeout(fn, 0)` does not
   run `fn` immediately; it runs at the *next* timers phase.
2. **Pending callbacks** — I/O callbacks deferred from the previous cycle.
3. **Poll** — the heart of the loop. It waits for new I/O events (network
   data, file reads) and executes their callbacks. If nothing is pending, the
   loop *blocks here* — this is the "idle" state of a server that is waiting
   for requests.
4. **Check** — `setImmediate()` callbacks.
5. **Close callbacks** — `'close'` event handlers.

### Where TaskFlow lives in the loop

Trace one HTTP request through the loop:

```
1. A TCP connection arrives (Hanna's login POST).
2. libuv's poll phase detects the incoming data.
3. The HTTP parser (in Node's standard library) reads the request.
4. Express/NestJS dispatches it to the route handler → your controller runs.
5. The handler hits `await` (e.g. bcrypt.compare) → returns control to the loop.
6. The loop returns to poll → handles other connections in the meantime.
7. The bcrypt work completes → its callback is queued → your `await` resumes.
8. The response is written → the loop moves on.
```

The single most important insight: **between steps 5 and 7, the entire server
is free to handle other requests.** That is how 63 concurrent requests share
one thread. The cost of a request is only the *synchronous* work it does in a
single pass through the handler; everything `await`ed yields the thread.

> **In the TaskFlow repo** — the whole backend is one such request handler.
> `backend/src/main.ts` boots it:
>
> ```ts
> const app = await NestFactory.create(AppModule);
> // … global pipes, guards, CORS …
> await app.listen(port);
> ```
>
> `app.listen(port)` tells libuv "start accepting TCP connections on this
> port" — and then the event loop runs forever, cycling timers → poll → check,
> handling every request that arrives. That's the entire backend: one event
> loop, one thread, an infinite cycle of phases.

### Timers: `setTimeout` vs `setImmediate`

Two timer flavors cause endless confusion, so settle it now:

- **`setTimeout(fn, 0)`** — runs `fn` at the *timers* phase (start of next cycle).
- **`setImmediate(fn)`** — runs `fn` at the *check* phase (end of current cycle).

Inside a poll-phase callback (i.e., inside I/O), `setImmediate` always fires
first, because check comes before the next timers phase. Outside I/O, the
ordering is unpredictable — do not write code that depends on it. NestJS uses
`setImmediate` internally in several places; TaskFlow's own code mostly uses
`setTimeout` (e.g., in tests, to simulate delays) and lets the framework handle
the rest.

> **⚠️ Common mistake.** Expecting `setTimeout(fn, 0)` to run "immediately."
> It runs at the next *timers phase*, after the current phase and after all
> currently-pending microtasks (§2.7). "Zero milliseconds" means "soon," not
> "now."

---

## 2.4 The single-threaded truth

Node.js runs your JavaScript on **one thread**. There is exactly one call
stack, and while it is executing your code, nothing else can run. This is the
fact that explains every Node.js performance rule you will ever hear.

But "single-threaded" is only half the truth. libuv maintains a **thread pool**
(4 threads by default) for operations that cannot be done asynchronously on the
main thread: file system access, DNS lookups, and *some* crypto. So the honest
model is:

```
Main thread (V8)               libuv thread pool (4 threads)
┌───────────────────┐          ┌─────────────────────────────┐
│ event loop        │          │  fs.readFile               │
│ your code         │ ───────▶ │  dns.lookup                │
│ callbacks         │          │  crypto (some ops)         │
└───────────────────┘          └─────────────────────────────┘
        │
        └──▶ Everything else that can't yield runs HERE and blocks.
```

### What blocks the loop — and what doesn't

**Does NOT block** (yields to the event loop):

- Database queries — `await this.userModel.findOne(...)` hands the query to
  MongoDB's driver and frees the thread.
- Network I/O — every HTTP request and response.
- `bcrypt.compare` / `bcrypt.hash` — the `bcrypt` package runs the expensive
  hashing on the libuv thread pool, then calls back.

**DOES block** (runs on the main thread, freezes everything):

- CPU-heavy computation — `JSON.stringify` of a 2 GB array, heavy regex, big
  loops.
- Synchronous I/O — `fs.readFileSync`, `child_process.execSync`.
- `bcryptjs` (the *pure-JS* bcrypt implementation) — unlike the native
  `bcrypt` package, it hashes on the main thread. TaskFlow uses native
  `bcrypt` (see `backend/package.json`) precisely because the pure-JS
  alternative would block the loop on every login.

### The real blocking example

TaskFlow hashes passwords with 12 salt rounds:

```ts
// backend/src/users/users.service.ts
const passwordHash = await bcrypt.hash(createUserDto.password, 12);
```

With native bcrypt this runs on the thread pool — good. But imagine it ran on
the main thread (or imagine someone "helpfully" switches to `bcryptjs`). Each
hash takes ~100–400 ms of *blocked* CPU. Ten concurrent user creations =
2–4 seconds where **no other request in the entire system can run** — the
dashboard hangs, notifications stall, every user in the system waits. That is
the single-threaded truth: one blocking call, and the whole API is down.

Similarly, the reports service aggregates tasks in memory:

```ts
// backend/src/reports/reports.service.ts
const tasks = await this.tasksRepository.findByProject(projectId);
const todoTasks = tasks.filter((t) => t.status === TaskStatus.TODO).length;
```

Filtering arrays in memory is fast — fine at TaskFlow's scale. But this is
exactly the code that would become a problem if a project ever had millions of
tasks: the filter loop is synchronous, and it runs on the main thread. The
book's Chapter 26 (Performance) shows the fixes — aggregation pipelines on the
database side, pagination, and projection — all of which exist to keep
synchronous work off the main thread.

> **❓ Interview question.** "Node.js is single-threaded — so how does it
> handle concurrency?" The answer: it doesn't do work concurrently; it does it
> *asynchronously*. I/O is delegated (to the OS and the libuv thread pool),
> and the event loop interleaves the *completion* of many in-flight
> operations. Concurrency is interleaving, not parallelism — except for the
> thread pool, which is genuine parallelism for I/O-shaped work.

---

## 2.5 Async: callbacks → promises → async/await

The event loop only works if your code *yields*. JavaScript's language feature
for yielding is **asynchrony**, and it has evolved through three generations.
TaskFlow's repository code is the perfect specimen because it is pure
I/O — every method is an async boundary.

### Generation 1: callbacks

The oldest style: pass a function to be called when the work completes.

```ts
// What TaskFlow's findByEmail looked like in callback style (reconstructed)
function findByEmail(email: string, cb: (err: Error | null, user?: any) => void) {
  db.users.findOne({ email }, (err, doc) => {
    if (err) return cb(err);
    cb(null, doc);
  });
}
```

Two problems made callbacks painful:

1. **Inversion of control** — the function that *does* the work decides when
   your code runs, not you.
2. **The pyramid of doom** — sequential operations nest forever, and error
   handling at every level is manual.

### Generation 2: promises

A **Promise** is an object representing a value that doesn't exist *yet*. It
has three states:

```
                    ┌─────────────┐
        resolve() ─▶│  fulfilled  │
                    └─────────────┘
   ┌──────────┐
──▶│ pending  │
   └──────────┘
                    ┌─────────────┐
        reject() ──▶│  rejected   │
                    └─────────────┘
```

Once a promise settles (fulfilled or rejected), it stays settled forever. You
attach reactions with `.then()` and `.catch()`, and — the key property — those
reactions run *later*, giving the event loop room to breathe.

TaskFlow's real repository methods are promise-returning. Here is the actual
code, and you can see the promise is implicit — `async` makes it so:

```ts
// backend/src/users/users.repository.ts (real)
async findByEmail(email: string): Promise<UserDocument | null> {
  return this.userModel.findOne({ email: email.toLowerCase() }).exec();
}
```

The method is `async` (returns a promise), and `await`-ing it elsewhere yields
the thread. This is modern Node in its natural habitat.

### Generation 3: async/await

`async`/`await` is syntax over promises — it lets you write sequential-looking
code that is still fully asynchronous. TaskFlow's login flow is a beautiful
chain of awaited promises:

```ts
// backend/src/auth/auth.service.ts (real, abridged)
async validateUser(loginDto: LoginDto): Promise<UserDocument> {
  const user = await this.usersService.findByEmailWithPassword(loginDto.email)
    .catch(() => null);                     // (1) query
  if (!user) throw new UnauthorizedException('Invalid email address or password');

  if (user.status === UserStatus.INACTIVE) {
    throw new UnauthorizedException('Your user account has been deactivated…');
  }

  const isPasswordValid = await bcrypt.compare(loginDto.password, user.passwordHash); // (2) hash check
  if (!isPasswordValid) throw new UnauthorizedException('Invalid email address or password');

  return user;
}
```

Each `await` is a yield point: query MongoDB (yield), compare hash (yield).
Between those yields, the event loop serves other requests. The code reads top
to bottom like synchronous code — but it is three separate slices of
execution interleaved with the rest of the server's work.

> **⚠️ Common mistake.** `await` in a loop. NestJS's notification listener
> actually needs a sequential loop (each notification is an independent write,
> and awaiting each keeps memory flat):
>
> ```ts
> for (const [recipient, message] of recipients) {
>   await this.notificationsRepository.create({
>     recipient,
>     type: NotificationType.COMMENT,
>     message,
>     task: event.taskId,
>     comment: event.commentId,
>     sender: event.authorId,
>   });
> }
> ```
>
> That's *correct* — sequential writes. The mistake is doing this when the
> operations are independent *and* the loop is huge: you serialize work that
> could run in parallel with `Promise.all`. The rule of thumb: sequential when
> order matters or memory is a concern; `Promise.all` when operations are
> independent and bounded.

---

## 2.6 Promises in depth

Promises have a few behaviors that trip people up — and they all show up in
real TaskFlow code.

### `.then()` returns a new promise

Chaining works because each `.then()` produces a *new* promise:

```ts
await this.usersService
  .findByEmailWithPassword(loginDto.email)  // promise A
  .catch(() => null)                        // promise B — resolves to user OR null
```

`findByEmailWithPassword` throws `NotFoundException` when the user doesn't
exist — but `validateUser` wants to treat "no user" as "invalid credentials,"
not a 404. The `.catch(() => null)` converts a rejection into a fulfilled
promise with value `null`. That is a real, idiomatic use of error recovery at
the promise level.

### Unhandled rejections are dangerous

A promise that rejects with no `.catch` attached is an **unhandled rejection**.
In modern Node, this crashes the process by default. NestJS's global exception
filter exists in part to ensure that async errors inside request handlers are
always caught and converted to HTTP responses:

```ts
// backend/src/common/filters/all-exceptions.filter.ts (concept)
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    // maps unknown errors to a 500 response instead of crashing
  }
}
```

(We study this filter in detail in Chapter 9.) The mental model: **every
promise in your system must eventually be settled — fulfilled or rejected —
and every rejection must be handled somewhere.** NestJS's request pipeline and
the global filter are the "somewhere" for request-scoped promises.

### Promise mechanics vs. the event loop

Here is the precise timing rule, which previews §2.7: when a promise settles,
its `.then`/`await` continuation is queued as a **microtask**, which runs *as
soon as the current synchronous execution finishes* — before the event loop
moves to its next phase. This is why:

```ts
const task = await this.tasksRepository.create(taskData);   // resolves later
this.eventEmitter.emit(TaskAssignedEvent.eventName, …);      // fires synchronously
```

When `create` resolves, the `await` resumes in a microtask — but the emit
after it is ordinary synchronous code and runs in the same microtask slice.
There is no "gap" where other requests sneak in between the resolve and the
emit.

---

## 2.7 Microtasks vs. macrotasks

This is the single most-tested Node.js concept in interviews, and the least
intuitive. Two kinds of queued work compete for the main thread:

| Kind | What queues it | When it runs |
|------|----------------|--------------|
| **Microtask** | Promise reactions (`.then`, `await` continuation), `process.nextTick` | After the *current* synchronous execution, **before the next event-loop phase** |
| **Macrotask** | `setTimeout`, `setInterval`, `setImmediate`, I/O callbacks | At the *next appropriate event-loop phase* (timers, check, poll) |

The ordering rule that decides everything:

> **After every synchronous block of code, Node drains the entire microtask
> queue before moving to the next event-loop phase.**

### The canonical example

```js
console.log('1');                              // sync
setTimeout(() => console.log('2'), 0);         // macrotask → timers phase
Promise.resolve().then(() => console.log('3')); // microtask
process.nextTick(() => console.log('4'));       // microtask (runs before .then!)
console.log('5');                              // sync
```

Output: **1, 5, 4, 3, 2** — and yes, `process.nextTick` beats a promise `.then`.

Why `4` before `3`? `process.nextTick` has its own queue that drains *before*
the promise microtask queue — Node's nextTick is the highest-priority
scheduled work there is. And `2` last because `setTimeout`'s callback is a
macrotask that waits for the next timers phase.

### In TaskFlow

The cron that scans for urgent deadlines is a perfect real-world macrotask: it
is scheduled by `setTimeout`-class machinery (the `@nestjs/schedule` cron
library) and runs at a timers-phase interval:

```ts
// backend/src/tasks/deadline-urgent.cron.ts (real)
@Cron(CronExpression.EVERY_HOUR)
async scanForUrgentDeadlines() {
  const now = new Date();
  const in24Hours = new Date(now.getTime() + 24 * HOUR_MS);
  const tasks = await this.tasksRepository.findDueWithin(now, in24Hours);
  for (const task of tasks) {
    await this.tasksService.notifyUrgentDeadlineIfDue(
      task._id.toString(),
      task.title,
      task.assigneeId,
      task.status,
      task.dueDate,
    );
  }
}
```

`@Cron(CronExpression.EVERY_HOUR)` means: "queue a macrotask every hour." The
cron's own `await`s are microtask continuations *within* that macrotask. Two
scheduling systems — cron (macrotask-level) and promise reactions
(microtask-level) — cooperating in one function.

And the event listener is a microtask question too: when
`this.eventEmitter.emit(...)` fires, the `@OnEvent` handler is *async*, so it
starts executing synchronously up to its first `await`, then continues as a
microtask chain:

```ts
// backend/src/notifications/listeners/notification.listener.ts (real)
@OnEvent(TaskAssignedEvent.eventName)
async handleTaskAssigned(event: TaskAssignedEvent) {
  await this.notificationsRepository.create({   // <-- first await → yields
    recipient: event.assigneeId,
    type: NotificationType.TASK_ASSIGNED,
    message: `You have been assigned to task: "${event.taskTitle}"`,
    task: event.taskId,
    sender: event.assignedBy,
  });
}
```

> **❓ Interview question.** "Order these: `process.nextTick`, a resolved
> promise's `.then`, `setTimeout(0)`, `setImmediate`." Answer:
> `nextTick` → `.then` (microtask queue) → `setImmediate` (check phase) →
> `setTimeout` (next timers phase). Inside I/O, `setImmediate` beats
> `setTimeout(0)`; outside I/O, their relative order is not guaranteed.

---

## 2.8 Streams — and why TaskFlow's reports are JSON

A **stream** is an abstraction for data that arrives or leaves in *chunks* over
time, instead of all at once. Instead of loading a whole file or response into
memory, a stream processes it piece by piece:

```
Without a stream:          With a stream:
┌──────────────┐           ┌──────────────┐
│ whole file   │           │ chunk  chunk  │
│ in memory    │           │ chunk  chunk  │
│ 2 GB         │           │ chunk        │
└──────────────┘           └──────────────┘
  (allocated,                 (processed as it arrives —
   then processed)             memory stays flat)
```

Four stream types exist in Node: **Readable** (source of data), **Writable**
(sink for data), **Duplex** (both), and **Transform** (a readable-writable
pair that modifies data as it passes — e.g. gzip). Piping connects them:
`source.pipe(transform).pipe(destination)`.

The canonical danger: building a huge string or buffer in memory just to send
it. `JSON.stringify(hugeArray)` allocates the entire serialized string at once;
`res.send(thatString)` copies it again. For a 2 GB report, that's 4+ GB of
memory for one response.

### The honest TaskFlow story: JSON, not PDF

Your brief mentioned "the PDF report path" — and here the book must tell the
truth about the codebase. **TaskFlow does not generate PDFs on the backend.**
The reports service returns structured JSON, and the code documents the
decision explicitly:

```ts
// backend/src/reports/reports.service.ts (real)
/**
 * All data is aggregated from existing repositories — no raw DB access.
 * Reports are returned as structured JSON objects (PDF formatting
 * is handled by the frontend or a future document-generation layer).
 */
```

Why is this the *right* design at TaskFlow's scale?

1. **The data is small.** A project report is a handful of tasks and counts —
   kilobytes, not gigabytes. There is nothing to stream, and adding a PDF
   library would be complexity without a payoff (YAGNI).
2. **Separation of concerns.** Report *data* (backend) is separate from report
   *presentation* (PDF, HTML, CSV — the frontend's job, Volume II). The API
   stays format-agnostic.
3. **The aggregation itself is the expensive part** — and it happens in memory
   on the main thread (§2.4). If TaskFlow ever hit millions of tasks per
   report, the fix would be MongoDB aggregation pipelines (Chapter 10) and
   *then* streaming the results, not PDF generation.

So the stream lesson is: **streams exist to keep memory flat when data is
large or infinite.** TaskFlow doesn't need them for reports today — and a
production engineer's job is knowing when *not* to add machinery. When a
future document-generation layer arrives, it will be a Transform stream
pipeline: `aggregateResult → transform (JSON→PDF rows) → write to response`.
Now you can already picture it.

> **Where streams DO appear in TaskFlow's world.** The HTTP layer itself is
> streamed — Express/NestJS receives request bodies and sends responses as
> streams internally. `@Body()` parsing, response serialization, even the
> `cookie-parser` middleware all operate over streamed transport. You are
> using streams every time you answer a request; you just don't write the
> pipe calls yourself.

---

## 2.9 EventEmitter — the pattern that powers notifications

Node's core library includes an `EventEmitter` class: an object that lets you
`emit(name, payload)` events and `on(name, handler)` subscribe to them. It is
the oldest and most important design pattern in Node — and it is the
foundation of TaskFlow's entire notification system.

### The pattern

```js
const { EventEmitter } = require('node:events');
const emitter = new EventEmitter();

emitter.on('task.assigned', (event) => {
  console.log(`Notify ${event.assigneeId}`);
});

emitter.emit('task.assigned', { taskId: '1', assigneeId: '2', taskTitle: 'Build API' });
```

Decoupled: the emitter does not know who is listening, and the listener does
not know who emitted. New listeners can be added without touching the emitter.

### NestJS's version: `@nestjs/event-emitter`

NestJS wraps this pattern (`EventEmitter2`) and exposes it with decorators.
TaskFlow uses it exactly like the plain pattern above — but with *typed
events* so the payload shape is compile-checked. The contract is a class:

```ts
// backend/src/notifications/events/task-assigned.event.ts (real)
export class TaskAssignedEvent {
  /** Event key shared by the emitter and the listener. */
  static readonly eventName = 'task.assigned';

  constructor(
    public readonly taskId: string,
    public readonly assigneeId: string,
    public readonly taskTitle: string,
    public readonly assignedBy: string,
  ) {}
}
```

The emitter constructs the event (so the shape is checked at compile time) and
emits it:

```ts
// backend/src/tasks/tasks.service.ts (real)
this.eventEmitter.emit(
  TaskAssignedEvent.eventName,
  new TaskAssignedEvent(
    task._id.toString(),
    createTaskDto.assignee,
    createTaskDto.title,
    actorId,
  ),
);
```

The listener subscribes with the same constant — no magic strings that can
drift apart:

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

Read the decoupling carefully — this is Chapter 18's case study in miniature:

- `TasksService` knows nothing about notifications, repositories, or MongoDB's
  notification collection. It emits an event and moves on.
- `NotificationListener` knows nothing about tasks, projects, or how tasks are
  created. It reacts to a typed payload.
- The two modules could be split into separate services, or a WebSocket
  channel could subscribe to the same events, *without touching TasksService*.

> **Why this design?** This is the "event seam" the book's architecture work
> hardened (Candidate 2 in Chapter 19). The alternative — calling
> `notificationsService.create(...)` directly from `TasksService` — creates a
> hard dependency between modules and a temptation to pass loosely-shaped
> objects around. The typed-event seam keeps the payload explicit and the
> modules decoupled. Notice the details: the event is a *class* (compile-time
> shape), the name is a *static constant* (shared by emitter and listener),
> and the actor is *required* (a task assignment without a human actor is a
> bug — made un-representable).

### Synchronous emit, async listener

One subtlety worth stating: `EventEmitter2`'s `emit()` is synchronous. When
`TasksService` calls `emit`, the listener's handler starts running *right
then* (synchronously) until its first `await`. This means:

1. The notification write is *not* guaranteed to complete before `create()`
   returns — it runs in the background microtask chain. This is fine (the
   notification is a side effect, not part of the request's response).
2. Because the handler's first statement is an `await` (the repository
   write), the DB call itself runs detached from the request path: a failing
   notification write does not fail the request that triggered it. The
   request's response is shaped before the write settles.

This is why the notification pipeline is resilient by construction: the
request's response does not depend on notification writes succeeding.

---

## 2.10 How NestJS is built on Node

NestJS looks like a different world — decorators everywhere, dependency
injection, modules. Underneath, it is **plain Node.js**: an Express HTTP
server, a runtime dependency-injection container, and a heavy use of
JavaScript features you already know. Let's unmask it.

### Decorators are just functions

A TypeScript decorator is a function that receives the thing it decorates and
can modify it. NestJS's `@Injectable()` is implemented roughly as:

```ts
// What @Injectable() does, simplified
function Injectable() {
  return (target: Function) => {
    Reflect.defineMetadata('injectable', true, target);
    return target;
  };
}
```

It attaches metadata to the class using `Reflect.defineMetadata` — nothing more
mysterious. The NestJS **container** (its dependency-injection machinery) reads
that metadata at startup, discovers all providers, and wires them together.
The "magic" of NestJS is: metadata + a graph-builder at boot time.

### Modules are classes, DI is a graph

`AppModule` in TaskFlow is an ordinary class with metadata describing the
composition root:

```ts
// backend/src/app.module.ts (real, abridged)
@Module({
  imports: [ConfigModule, EventEmitterModule, DatabaseModule, UsersModule, …],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
```

At boot, the container builds a graph of providers. `TasksService` declares
its dependencies in its constructor:

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

Nest reads the constructor's parameter types (via TypeScript's emitted design
metadata — the same `Reflect` machinery as the decorators), finds a provider
of each type in the graph, and constructs `TasksService` with the *same
singleton instances* used everywhere else. That's the whole trick: **the
container is a dependency graph constructed at boot, and every
`constructor(private readonly x: X)` is a graph edge.**

> **Why this design?** Three benefits, all Node-shaped:
> - **Testability.** Because instances come from the container, a test can
>   replace any provider with a mock — which is exactly how TaskFlow's 190+
>   tests work (Chapter 22): instantiate a testing module, override the
>   repository with a fake, and exercise the service in isolation.
> - **Singleton sharing.** One `TasksRepository` instance is shared by every
>   consumer — no duplicate connections, no drift between copies.
> - **Boot-time failure.** If a dependency is missing or circular, the app
>   fails at startup with a clear error instead of at runtime with a
>   `TypeError`.

### The whole stack, unmasked

```
TypeScript decorators ──▶ functions that attach Reflect metadata
NestJS DI container    ──▶ a graph built at boot from that metadata
@nestjs/event-emitter  ──▶ Node's EventEmitter, decorated
Express adapter        ──▶ Node's http module + the event loop
libuv + V8             ──▶ the runtime underneath everything
```

Every layer is ordinary Node.js. NestJS is a disciplined way of *organizing*
what Node gives you — and once you see the event loop, promises, and the
EventEmitter underneath it, the framework stops being a black box and becomes
a tool you can reason about.

---

## 2.11 Common mistakes

**1. Blocking the loop with synchronous work.** `JSON.stringify` of huge
payloads, `for` loops over massive arrays, `bcryptjs` instead of native
`bcrypt`. Rule: if a request handler does CPU work that takes more than a few
milliseconds on the main thread, the entire server stalls. Move it off-thread
or shrink the data (`.lean()`, projection, pagination).

**2. Assuming `await` means "the server waits."** It doesn't — it yields. The
server handles other requests while your promise is pending. Code that works
when one user is testing can silently behave differently under concurrency
(e.g., race conditions between an awaited read and a subsequent write — the
reason TaskFlow checks duplicate emails at the service *and* the unique-index
level).

**3. Misordering timers and microtasks.** Writing
`setTimeout(() => doThing(), 0)` when a promise continuation would do,
or expecting `setTimeout` output before promise reactions. Re-read §2.7's
table until the ordering is reflex.

**4. Not handling promise rejections.** An `async` handler that throws without
a catch becomes an unhandled rejection. NestJS's global filter catches
request-scoped errors, but promises *outside* a request (cron jobs, event
listeners, background loops) need explicit `.catch()` or try/catch — the cron
in TaskFlow logs its scan but a throwing per-task iteration would otherwise
reject the whole cron promise.

**5. Serializing independent work with `await` in a loop.** The notification
listener's sequential `for…await` is correct (independent writes, memory
flat). But `await`ing inside a loop of 10,000 *independent* calls is
needlessly slow — use `Promise.all` with a bounded batch.

**6. Forgetting `process.nextTick` exists.** It is a microtask that runs
before promise reactions. You will rarely call it in application code — but
when you debug someone else's "why is this running before my promise?!"
mystery, this is the answer.

---

## Exercises

### 🟢 Concept

1. Name the two components of Node.js and, in one sentence each, what they do.
2. Draw the event loop's phases in order. Which phase is the server "in" while
   it idles waiting for requests?
3. Explain why `bcrypt.hash` with the native package doesn't block the event
   loop, but the same call with `bcryptjs` would.
4. What is the difference between a microtask and a macrotask? Give one
   example of each from TaskFlow (e.g. a promise continuation vs. the hourly
   cron).
5. Why does `@nestjs/event-emitter` exist instead of TasksService calling
   NotificationsService directly?

### 🟡 Code

6. Open `backend/src/users/users.repository.ts`. Every method is `async`.
   Rewrite `findByEmail` in callback style, then explain in two sentences why
   the async version is better.
7. Open `backend/src/tasks/tasks.service.ts`. Find `notifyUrgentDeadlineIfDue`
   and trace its `await`s. Which yields are database I/O, and which is the
   event emit that runs synchronously?
8. Add a `console.log` at the top of `NotificationListener.handleTaskAssigned`
   and one at the end of `TasksService.create` (after the emit). Run the task
   creation test and observe the order. Explain what you see using microtask
   vs. macrotask terms. *(Then remove the logs.)*

### 🔴 Debug

9. A teammate reports: "Every request hangs for 3 seconds when anyone creates
   a user!" They recently switched `bcrypt` to `bcryptjs` in
   `backend/src/users/users.service.ts`. Explain exactly what is happening at
   the event-loop level, and why *every* request — not just user creation —
   is affected.

10. This code prints `1, 3, 2` instead of the expected `1, 2, 3`:
    ```js
    console.log('1');
    setTimeout(() => console.log('2'), 0);
    Promise.resolve().then(() => console.log('3'));
    ```
    Is the output wrong? Explain the *correct* expected output and why.

### ⚫ Mini-project

11. Write a small Node script (no NestJS) that imports the `EventEmitter`
    pattern from §2.9 and simulates TaskFlow's notification flow: emit
    `task.assigned` with a typed object, have two listeners (one "creates a
    notification record" by logging, one "sends a WebSocket push" by logging),
    and verify both fire. Then add a third listener and observe that the
    emitter didn't change at all — that's the decoupling.

---

## Interview questions

1. "What is Node.js, and how is it different from JavaScript?" — A runtime
   (V8 + libuv); JavaScript is the language, Node is where it runs outside
   the browser.
2. "Explain the event loop." — The single-threaded cycle of phases (timers →
   pending → poll → check → close) that processes scheduled work; I/O
   delegates to libuv and the thread pool, and callbacks return to the loop.
3. "Why is Node.js single-threaded, and how does it handle concurrency?" —
   One JS thread, no thread-safety headaches; concurrency via async I/O and
   interleaving, plus a libuv thread pool for fs/crypto.
4. "What blocks the event loop?" — CPU-bound synchronous work: stringifying
   large structures, heavy loops, sync I/O, pure-JS crypto. Give TaskFlow's
   bcrypt example.
5. "Microtask vs. macrotask — what's the order?" — Microtasks (nextTick, then
   promise reactions) drain after each synchronous block, before the next
   phase; macrotasks (timers, setImmediate, I/O) run at their phase.
6. "What are streams and when would you use them?" — Chunked data processing
   to keep memory flat; large files, large responses, transforms. And
   honestly: when the data is small, you don't — TaskFlow's JSON reports are
   the deliberate counterexample.
7. "How does the observer pattern / EventEmitter work?" — `emit`/`on`;
   decoupled producers and consumers; used by NestJS's event system for the
   notification pipeline.
8. "How does NestJS's dependency injection work under the hood?" — Decorators
   attach metadata; the container builds a provider graph at boot from
   constructor parameter types; providers are singletons by default.
9. "Your server slows down under load — what do you check first?" —
   Whether the event loop is being blocked (CPU work on the main thread),
   whether the database is the bottleneck, and whether memory/GC pressure is
   high. Chapter 26 is this answer, expanded.

---

## Key takeaways

1. **Node.js = V8 + libuv.** V8 runs your JavaScript; libuv runs the event
   loop and the thread pool. The seam between them is every `await` in your
   code.
2. **One thread, interleaved concurrency.** The event loop never waits: I/O is
   delegated, completions are queued, and the server stays responsive — until
   synchronous CPU work blocks the loop. Protect the loop like the production
   system it is.
3. **Microtasks before macrotasks.** Promise reactions and `nextTick` drain
   before the next event-loop phase. Ordering isn't magic — it's a queue
   discipline you can predict.
4. **Streams are for big data.** Streams keep memory flat for large or
   infinite payloads — and TaskFlow's JSON reports are a deliberate reminder
   that the right tool for small data is no tool at all.
5. **The EventEmitter is the skeleton key.** Node's oldest pattern powers
   NestJS's events, and TaskFlow's typed-event notifications (Chapter 18) are
   that pattern with compile-time safety.
6. **NestJS is organized Node.js.** Decorators are metadata, DI is a boot-time
   graph, modules are classes. Nothing is magic — which means nothing is
   beyond your ability to debug.

## Further reading

- *Node.js Design Patterns* — Mario Casciaro & Luciano Mammino. The definitive
  treatment of callbacks, promises, streams, and the observer pattern.
- [Node.js Event Loop documentation](https://nodejs.org/en/docs/guides/event-loop-timers-and-nexttick/) —
  the official phase-by-phase guide this chapter condensed.
- [libuv design document](https://docs.libuv.org/en/v1.1.x/design.html) — the
  C library under the event loop, if you want the deepest layer.
- *You Don't Know JS: Async & Performance* — Kyle Simpson. Microtasks,
  promises, and generators made visceral.

---

*In Chapter 3, we give this runtime a backbone: TypeScript — the language that
turns TaskFlow's domain rules (statuses, roles, event payloads) into types the
compiler enforces.*

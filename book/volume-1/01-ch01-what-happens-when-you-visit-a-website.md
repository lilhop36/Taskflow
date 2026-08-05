# Chapter 1 — What Happens When You Visit a Website?

> **Opening scenario.** Hanna sits down at her laptop, opens a browser, and
> types `http://localhost:3000` into the address bar. The TaskFlow login page
> appears. She types her email and password, presses **Sign in**, and a moment
> later she is looking at her dashboard — her projects, her tasks, the red
> "3" badge on the notifications bell.
>
> In the roughly 700 milliseconds between the Enter key and the rendered
> dashboard, dozens of distinct technologies worked together: a domain name was
> resolved, a TCP connection was opened, encrypted bytes travelled over the
> network, an HTTP request was parsed, a JSON payload was validated, a password
> hash was compared, a token was signed, a database query was executed, and
> several HTTP responses were decoded. This chapter is about what actually
> happens in that 700 milliseconds — every layer, from the wire up.

This is the only chapter of the book that is not strictly "backend." It is the
bridge between the world you already live in — the browser — and the world the
rest of this volume is about — the server. If you can trace one request from a
browser keystroke to a MongoDB document and back, every later chapter becomes
details on a map you already hold.

**Learning objectives.** By the end of this chapter you will be able to:

- explain what the Internet actually is, and name the four layers a request crosses;
- describe what DNS does and why `localhost` is special;
- explain what a TCP connection is and why HTTP rides on top of it;
- read an HTTP request and response, and map every status code TaskFlow uses to its meaning;
- explain what HTTPS protects and how the browser verifies the server;
- describe REST constraints and check TaskFlow's API against them;
- read a JSON payload and explain why JSON and not something else;
- **trace a real TaskFlow login and a real task creation end to end** — every file, every function, every layer;
- and locate every concept from this chapter in the TaskFlow repository.

---

## 1.1 The Internet in one picture

Ask ten people what the Internet is and you will get ten answers, most of them
wrong in interesting ways. Here is the version that matters for a backend
engineer:

> The Internet is a network of networks — billions of computers, each with a
> unique address, connected by routers that forward data in small chunks called
> **packets**, using a common set of protocols so that any two machines can
> talk.

Three words carry the whole model: **addresses**, **packets**, and **protocols**.

**Addresses.** Every machine on the Internet has an IP address. In the IPv4
scheme (the one that's been running the world since 1983) an address looks like
this:

```
192.168.1.24
```

Four numbers, each 0–255, separated by dots. That is 4 bytes — 32 bits —
enough for about 4.3 billion distinct addresses, which is why the world is
slowly moving to IPv6, whose addresses look like:

```
2001:0db8:85a3:0000:0000:8a2e:0370:7334
```

That is 128 bits. Enough for every grain of sand on Earth, with change.

Your machine also has a special address reserved for "this computer, talking to
itself": `127.0.0.1`, usually written as the name `localhost`. When TaskFlow's
frontend talks to `http://localhost:3001`, no packet ever leaves your machine —
the request loops back through the network stack to a server running on the
same computer.

**Packets.** The Internet does not move files; it moves packets. When your
browser requests a page, the data is chopped into chunks — typically up to
about 1,500 bytes each, the size a physical Ethernet frame can carry — and each
chunk travels independently, possibly over different routes, and is reassembled
at the destination. If a packet is lost, only that packet is resent, not the
whole file.

**Protocols.** A protocol is a shared convention — the "language" both sides
agree to speak. The Internet works because a stack of protocols, each with a
precise specification, cooperates:

```
┌─────────────────────────────────────────────────────┐
│ Application layer   HTTP, HTTPS, JSON, REST         │  ← what this book mostly is
├─────────────────────────────────────────────────────┤
│ Transport layer     TCP (the connection)            │  ← §1.3
├─────────────────────────────────────────────────────┤
│ Internet layer      IP (the addressing)             │
├─────────────────────────────────────────────────────┤
│ Link layer          Ethernet, Wi-Fi (the wire/air)  │
└─────────────────────────────────────────────────────┘
```

Each layer only talks to the layers immediately above and below it. The
application layer does not know how packets are routed; the link layer does not
know what an HTTP request is. This **layering** is the single most important
architectural idea in networking — and, as you will see in Chapter 4, it is the
same idea NestJS uses to structure applications.

For the rest of this chapter, we climb this stack from the bottom up, then put
it together with a real walkthrough.

---

## 1.2 DNS — finding the machine

Nobody wants to type `192.168.1.24` into a browser. They want to type a name.
The **Domain Name System (DNS)** is the phonebook that translates names into
addresses.

When you type `taskflow.dev` into a browser, this happens:

```
1. You ask the resolver: "What is the IP address of taskflow.dev?"
2. The resolver asks the root servers: "Who is authoritative for .dev?"
3. The root servers point to the .dev registry servers.
4. The registry servers point to the nameservers for taskflow.dev.
5. Those nameservers answer: "taskflow.dev is at 192.0.2.44."
6. The answer is cached locally — by your OS, and by the resolver.
```

Each step is a tiny DNS query, and each answer is a small UDP packet. The whole
chain takes a few milliseconds after the first lookup; subsequent visits use the
cache.

> **Why this matters for TaskFlow.** In development, there is no DNS lookup at
> all — `localhost` is resolved by your operating system's hosts file
> (`C:\Windows\System32\drivers\etc\hosts` on Windows, `/etc/hosts` on macOS and
> Linux), which maps `localhost` to `127.0.0.1`. That is why the frontend can
> use `http://localhost:3001/api` and never leave your machine.
>
> In production, the story is exactly the one above: the API lives behind a
> domain, DNS resolves it, and HTTPS (§1.5) keeps the traffic private.

**Ports.** An IP address identifies a *machine*, but a machine runs many
servers. A **port** identifies which *program* on that machine. Ports are
numbers 0–65535, and a connection is always `IP:port` at both ends.

TaskFlow's development topology uses three ports:

| Port | Who listens | Purpose |
|------|-------------|---------|
| `3000` | Next.js frontend | The browser-facing app |
| `3001` | NestJS backend | The API (the subject of this book) |
| `27017` | MongoDB | The database |

When you see `http://localhost:3001/api`, you are saying: "machine `localhost`,
program on port `3001`, HTTP protocol, path `/api`."

> **In the TaskFlow repo** — the frontend's API client hard-codes this address.
> `frontend/lib/api.ts`:
>
> ```ts
> const api = axios.create({
>   baseURL: 'http://localhost:3001/api',
>   withCredentials: true,
>   headers: { 'Content-Type': 'application/json' },
> });
> ```

**Common mistake.** A developer starts the backend, opens `localhost:3000`,
sees "connection refused," and assumes the backend is broken. It isn't — the
backend is on `3001`. Port confusion is the #1 "my app doesn't work" cause in
local development. Always check *which port* the error mentions.

---

## 1.3 TCP/IP — the connection

IP gets packets to the right machine. But packets can be lost, reordered, or
duplicated — and a browser wants a reliable, ordered, error-checked stream of
bytes. That is the job of **TCP (Transmission Control Protocol)**.

TCP's contract: *two programs agree to exchange a stream of bytes, in order,
without loss, and both sides know when the other side is done.*

### The three-way handshake

Before any HTTP request can be sent, the client and server establish a TCP
connection with a three-message dance:

```
Client                          Server
  │  SYN ──────────────────────▶   "I want to talk. Here's my starting sequence."
  │  SYN-ACK ◀──────────────────   "Received. My starting sequence is X."
  │  ACK ──────────────────────▶   "Received. Connection established."
  │
  │  (now both sides can send data)
```

You will see this referenced constantly in interviews and debugging tools:

- **SYN** (synchronize) — the client's opening move.
- **SYN-ACK** — the server acknowledges and synchronizes back.
- **ACK** — the client confirms. Connection open.

A tool like `curl -v` shows the handshake happening in real time.

### Reliable delivery

Once connected, TCP numbers every byte and every segment, so the receiver can
detect and repair three failure modes:

- **Loss** — a segment never arrives → the receiver asks for it again.
- **Reordering** — segments arrive out of order → the receiver reorders by sequence number.
- **Duplication** — a retransmission doubles up → the receiver discards the copy.

TCP also does **flow control** (the receiver says "slow down, my buffer is
full") and **congestion control** (both ends slow down when the network is
overloaded — this is why the Internet doesn't collapse at peak times).

**Why this matters for TaskFlow.** Every HTTP request in this book — every
`POST /api/auth/login`, every `GET /api/tasks` — runs over a TCP connection.
The server framework (Express, which NestJS uses under the hood) hands you
`req` and `res` objects that abstract the socket away. But when a request
hangs, or times out, or a connection drops mid-response, the cause is almost
always at this layer, not in your NestJS code.

> **In the TaskFlow repo** — the backend boots an HTTP server on a TCP port:
> `backend/src/main.ts`:
>
> ```ts
> const port = process.env.PORT ?? 3000;
> await app.listen(port);
>
> console.log(`Application running on: http://localhost:${port}/api`);
> ```

### HTTP keep-alive

Naively, every request would open a new TCP connection (handshake included) and
close it — a huge waste. HTTP/1.1 introduced **keep-alive**: the client reuses
the same TCP connection for many requests. Modern HTTP/2 goes further with
multiplexing — many requests sharing one connection simultaneously. You do not
need to configure any of this; the frameworks do it. But when you see
"connection: keep-alive" in response headers, you now know what it means.

---

## 1.4 HTTP — the language of the web

Now the connection exists, two programs can talk. **HTTP (Hypertext Transfer
Protocol)** is the language they speak. It is the protocol your entire backend
career will be spent speaking, so we are going to be precise here.

### An HTTP request

An HTTP request is plain text with a rigid structure:

```
POST /api/auth/login HTTP/1.1
Host: localhost:3001
Content-Type: application/json
Cookie: access_token=eyJhbGciOiJIUzI1NiJ9...
Content-Length: 64

{"email":"hanna@taskflow.dev","password":"correct horse battery staple"}
```

Three parts:

1. **Request line** — method, path, protocol version.
2. **Headers** — key/value metadata: who (`Host`), what format (`Content-Type`), what credentials (`Cookie`), how big (`Content-Length`).
3. **Body** — optional payload, separated from the headers by a blank line.

### HTTP methods

Methods are verbs that describe the *intent* of a request. There are nine
defined by the spec; a backend engineer lives with these five:

| Method | Meaning | Idempotent? | TaskFlow example |
|--------|---------|-------------|------------------|
| `GET` | Fetch a resource, no side effects | Yes | `GET /api/tasks` |
| `POST` | Create a resource (or trigger an action) | No | `POST /api/tasks` |
| `PATCH` | Partially update a resource | No | `PATCH /api/tasks/:id/status` |
| `PUT` | Replace a resource entirely | Yes | (TaskFlow uses `PATCH` for updates) |
| `DELETE` | Remove a resource | Yes | (TaskFlow deactivates instead — see §1.7) |

**Idempotent** means: send it twice, and the result is the same as sending it
once. `GET /api/tasks` twice returns the same list twice. `POST /api/tasks`
twice creates *two* tasks. This distinction matters for retries — if a `POST`
fails midway, retrying is dangerous; if a `GET` fails, retrying is safe.

### Status codes

Every response carries a three-digit **status code** — the single most
important piece of information in a response. The digits are grouped by hundred:

| Range | Meaning | You'll see it when… |
|-------|---------|---------------------|
| `1xx` | Informational | (rarely seen by application code) |
| `2xx` | Success | `200 OK`, `201 Created`, `204 No Content` |
| `3xx` | Redirection | `302 Found`, `304 Not Modified` |
| `4xx` | Client error — *you* did something wrong | `400`, `401`, `403`, `404` |
| `5xx` | Server error — *we* did something wrong | `500 Internal Server Error` |

TaskFlow uses a small, deliberate set. Let's map each one to a real route:

| Code | Meaning | In TaskFlow |
|------|---------|-------------|
| `200 OK` | Success | `POST /api/auth/login` (login succeeds with `@HttpCode(HttpStatus.OK)`) |
| `201 Created` | Resource created | `POST /api/tasks` — a new task document exists in MongoDB |
| `400 Bad Request` | Malformed input | Sending `{"title": ""}` — the `ValidationPipe` rejects it |
| `401 Unauthorized` | Not authenticated | Missing/invalid JWT; wrong password (`UnauthorizedException`) |
| `403 Forbidden` | Authenticated but not allowed | A Team Member calling a PM-only route (`ForbiddenException`) |
| `404 Not Found` | No such resource | `GET /api/tasks/507f1f77bcf86cd799439011` when no such task exists |
| `500 Internal Server Error` | The server crashed | An unhandled exception — the `AllExceptionsFilter` catches it |

> **Common mistake.** Developers confuse `401` and `403`. The mnemonic:
> **401 = who are you?** (no/invalid credentials), **403 = I know you, but no.**
> (valid credentials, insufficient permission). NestJS enforces this split
> cleanly: `JwtAuthGuard` throws `UnauthorizedException` (401) when the token is
> missing or invalid; `RolesGuard` throws `ForbiddenException` (403) when the
> token is valid but the role is wrong.

> **In the TaskFlow repo** — the two guards that own this distinction:
> `backend/src/common/guards/jwt-auth.guard.ts` throws `UnauthorizedException`,
> and `backend/src/common/guards/roles.guard.ts` throws `ForbiddenException`.
> We study both in depth in Chapters 7 and 14.

### Headers that matter

Headers are the metadata of the conversation. The ones you will meet daily:

- `Content-Type` — what the body is (`application/json`).
- `Authorization: Bearer <token>` — credentials (TaskFlow also uses cookies, §1.6).
- `Cookie` / `Set-Cookie` — state stored by the browser and sent back on every request.
- `Content-Length` — body size in bytes.
- `Cache-Control` — whether/for how long a response may be cached.

---

## 1.5 HTTPS — the encrypted envelope

HTTP sends everything in plaintext. Anyone who can read packets on the network
— a coffee-shop Wi-Fi operator, an ISP, a router in the path — can read the
request line, headers, and body. That includes passwords.

**HTTPS** is HTTP inside an encrypted tunnel called **TLS (Transport Layer
Security)**. The browser and server first perform a **TLS handshake** to agree
on a session key, then every byte of every HTTP request and response is
encrypted with that key. An eavesdropper sees only gibberish.

Two things the TLS handshake achieves:

1. **Confidentiality** — the data is encrypted in transit.
2. **Server authentication** — the server proves its identity with a
   **certificate**, a digitally signed document issued by a **Certificate
   Authority (CA)**. The browser ships with a list of trusted CAs; if a
   server's certificate isn't signed by one of them, the browser shows a
   warning. This is what stops an attacker from impersonating a site.

> **Why this matters for TaskFlow.** In development (`http://localhost`) there
> is no encryption, and that is fine — traffic never leaves your machine. In
> production, TaskFlow must be served over HTTPS, which is why the auth cookies
> in §1.6 carry `secure: true` only when `NODE_ENV === 'production'` — the
> `Secure` cookie attribute means "only send this cookie over HTTPS."
>
> ```ts
> res.cookie('access_token', accessToken, {
>   httpOnly: true,
>   secure: process.env.NODE_ENV === 'production',
>   sameSite: 'lax',
>   maxAge: 30 * 60 * 1000, // 30 minutes
> });
> ```

---

## 1.6 Anatomy of a request and response

Let's see the real thing. With the backend running, open a terminal and send a
login request with `curl`, a command-line HTTP client:

```bash
$ curl -v -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"hanna@taskflow.dev","password":"wrong-password"}'
```

The `-v` flag prints everything. Here is what you will see (trimmed):

```
*   Trying 127.0.0.1:3001...
* Connected to localhost (127.0.0.1) port 3001            ← TCP handshake done
> POST /api/auth/login HTTP/1.1                            ← request line
> Host: localhost:3001                                     ← headers begin
> Content-Type: application/json
> Content-Length: 60
>
* upload completely sent off
< HTTP/1.1 401 Unauthorized                                ← status line
< X-Powered-By: Express                                    ← response headers
< Content-Type: application/json
< Content-Length: 84
<
* Connection #0 to host localhost left intact
{"message":"Invalid email address or password"}            ← body
```

Read this response body by body:

1. `Trying 127.0.0.1:3001` — the client resolved `localhost` and opened a TCP connection.
2. The request line and headers were sent.
3. The server replied `401 Unauthorized` — `AuthService.validateUser` found the password wrong.
4. The body is JSON: `{"message":"Invalid email address or password"}`.

Now send the *correct* password and watch what changes:

```bash
$ curl -v -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"hanna@taskflow.dev","password":"TaskFlow1!"}'
```

```
< HTTP/1.1 200 OK
< Set-Cookie: access_token=eyJhbGciOiJIUzI1NiIs...; Max-Age=1800; Path=/; HttpOnly; SameSite=Lax
< Set-Cookie: refresh_token=eyJhbGciOiJIUzI1NiIs...; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax
< Content-Type: application/json
<
{"accessToken":"eyJhbGciOiJIUzI1NiIs...","user":{"firstName":"Hanna","email":"hanna@taskflow.dev","role":"TeamMember"}}
```

Two things worth pausing on:

**The cookies.** The response has two `Set-Cookie` headers. The browser stores
them and sends them back on every subsequent request to this host (via the
`Cookie` header), *without JavaScript ever seeing them* — that is what
`HttpOnly` means. The frontend's axios client sets `withCredentials: true`
exactly so cookies are included. We examine the full token design in Chapter 13.

**The JSON body.** The response is structured data — not HTML. The frontend
reads `res.data.user`, stores it in React state, and redirects Hanna to her
dashboard. That JSON round-trip is the heart of the whole book.

> **In the TaskFlow repo** — the controller that produced this response:
> `backend/src/auth/auth.controller.ts`:
>
> ```ts
> @Public()
> @Post('login')
> @HttpCode(HttpStatus.OK)
> async login(
>   @Body() loginDto: LoginDto,
>   @Res({ passthrough: true }) res: Response,
> ) {
>   const user = await this.authService.validateUser(loginDto);
>   return this.authService.login(user, res);
> }
> ```
>
> `@Public()` marks the route as exempt from authentication; `@Post('login')`
> combined with the global `/api` prefix yields `POST /api/auth/login`;
> `@Body()` receives the JSON body; the service does the real work.

---

## 1.7 REST — the architecture of TaskFlow's API

Now that you can read a request and response, we can talk about how an API is
*structured*. **REST (Representational State Transfer)** is an architectural
style for networked systems, described by Roy Fielding in his 2000 doctoral
dissertation. It is not a protocol — it is a set of constraints that, when
followed, produce systems that are simple, scalable, and predictable.

The four constraints that matter most for a backend engineer:

1. **Resources and nouns.** The API is built around *resources* — things, not
   actions. A task is a resource. "Create a task" is not a resource; it's an
   operation *on* the task resource, expressed with `POST /api/tasks`.

2. **HTTP methods as verbs.** The five methods from §1.4 act on resources:
   create with `POST`, read with `GET`, update with `PATCH`, replace with
   `PUT`, delete with `DELETE`.

3. **Statelessness.** Each request is self-contained: the server does not
   remember you between requests. All state lives in the request (headers,
   cookies, body). This is why every request carries its own credentials — and
   why TaskFlow's auth is cookie/token-based rather than "logged in on the
   server."

4. **Uniform interface.** Resources are identified by URLs, manipulated with
   the standard methods, and represented in a standard format (JSON). A client
   that knows the conventions can explore the API without a manual.

### TaskFlow's route table

Here is the real API, viewed through the REST lens. Note the pattern:
`/collection` for the collection, `/collection/:id` for one member, and
sub-resources like `/tasks/:id/status` and `/notifications/:id/read`:

| Method | Path | What it does | Resource |
|--------|------|--------------|----------|
| `POST` | `/api/auth/login` | Authenticate | session |
| `POST` | `/api/auth/refresh` | Rotate tokens | session |
| `GET` | `/api/auth/session` | Who am I? | session |
| `POST` | `/api/auth/logout` | End session | session |
| `GET/POST` | `/api/users` | List / create users | user collection |
| `PATCH` | `/api/users/:id` | Update a user | user member |
| `PATCH` | `/api/users/:id/deactivate` | Deactivate (not delete) | user action |
| `GET/POST` | `/api/projects` | List / create projects | project collection |
| `PATCH` | `/api/projects/:id/archive` | Archive a project | project action |
| `GET/POST` | `/api/tasks` | List / create tasks | task collection |
| `GET/PATCH` | `/api/tasks/:id` | Read / update a task | task member |
| `PATCH` | `/api/tasks/:id/status` | Transition status | task action |
| `GET/POST` | `/api/tasks/:taskId/comments` | Read / add comments | comment collection (nested under its task) |
| `PATCH/DELETE` | `/api/tasks/:taskId/comments/:commentId` | Edit / delete a comment | comment member |
| `GET` | `/api/notifications` | List notifications | notification collection |
| `GET` | `/api/notifications/unread-count` | Unread badge count | notification query |
| `PATCH` | `/api/notifications/:id/read` | Mark one read | notification member |
| `PATCH` | `/api/notifications/read-all` | Mark all read | notification action |
| `GET` | `/api/reports/dashboard` | Aggregated stats | report |
| `GET` | `/api/reports/project/:projectId` | Project status report | report |
| `GET` | `/api/reports/employee/:userId` | Employee performance report | report |

**Why this design?** Every resource, every action, every route in this table
has a reason. `PATCH /api/users/:id/deactivate` exists instead of
`DELETE /api/users/:id` because of a *business rule*: BR-004 says deactivating a
user must preserve their historical data (the tasks they created, the comments
they wrote). Deleting the document would destroy the audit trail; setting
`status: Inactive` preserves it. The API shape is a direct reflection of the
domain's rules — that is what production API design looks like.

> **In the TaskFlow repo** — `backend/src/users/users.repository.ts` documents
> the decision in code:
>
> ```ts
> // Deactivates a user by setting their status to Inactive.
> // BR-004: this must NOT delete the user or their historical records.
> async deactivate(id: string): Promise<UserDocument | null> {
>   return this.userModel
>     .findByIdAndUpdate(id, { status: UserStatus.INACTIVE }, { new: true })
>     .select('-passwordHash')
>     .exec();
> }
> ```

### Where REST is fuzzy (and where TaskFlow bends it)

Real systems bend REST where the domain demands it. TaskFlow has a few:

- **Actions as sub-resources.** `PATCH /api/tasks/:id/status` is an action, not
  a CRUD operation. Purists would model status as a field (`PATCH /api/tasks/:id`
  with `{ status: 'Done' }`). TaskFlow keeps it as an explicit route because a
  status transition is a *business event* — it triggers notifications, computes
  completion, and is governed by a state machine (Chapters 5 and 8).
- **Cookies, not bearer tokens.** REST is silent on *how* you authenticate.
  TaskFlow uses HTTP-only cookies — a defensible, security-driven choice we
  dissect in Chapter 13.
- **`unread-count`** is a computed query, not a resource. A common, pragmatic
  REST extension: read-oriented convenience endpoints.

The lesson: REST is a toolkit, not a religion. Fielding's constraints buy you
predictability; the domain's needs buy you correctness. Production APIs
balance the two, deliberately and explicitly — never accidentally.

---

## 1.8 JSON — what crosses the wire

Every request and response body in this book is **JSON (JavaScript Object
Notation)**. JSON is a text format for structured data, derived from JavaScript
object literals, with one superpower: *every programming language can parse
it*, because the spec is tiny and unambiguous.

A JSON value can be:

- a string: `"Build API"`
- a number: `42`
- a boolean: `true`
- `null`
- an array: `[1, 2, 3]`
- an object: `{"key": "value"}`

That's the entire language. No dates (they're strings), no `undefined`, no
comments, no trailing commas. JSON's strictness is a feature: it makes parsing
trivial and safe.

### What a TaskFlow document looks like in JSON

Here is the JSON representation of a real task, as returned by
`GET /api/tasks/:id` (the `assignee` and `createdBy` fields are *populated* —
embedded copies of the related user documents, minus password hashes):

```json
{
  "_id": "65d0b1a2c3d4e5f678901234",
  "title": "Build the task dashboard",
  "description": "Implement the dashboard aggregate endpoint and wire the chart",
  "priority": "High",
  "status": "In Progress",
  "dueDate": "2026-08-14T00:00:00.000Z",
  "project": "65d0b1a2c3d4e5f678901235",
  "assignee": {
    "_id": "65d0a1b2c3d4e5f678901231",
    "firstName": "Hanna",
    "lastName": "Girma",
    "email": "hanna@taskflow.dev",
    "role": "TeamMember",
    "status": "Active"
  },
  "createdBy": {
    "_id": "65d0a1b2c3d4e5f678901230",
    "firstName": "Liya",
    "lastName": "Kebede",
    "email": "liya@taskflow.dev",
    "role": "Administrator"
  },
  "createdAt": "2026-07-01T09:15:00.000Z",
  "updatedAt": "2026-07-20T14:02:00.000Z"
}
```

Notice the shapes that recur throughout the book:

- **`_id`** — MongoDB's ObjectId, a 24-character hex string. It is the
  universal identifier in this system: tasks reference projects by it, comments
  reference tasks by it, notifications reference tasks by it.
- **`assignee` and `createdBy`** — these are *references* to the `users`
  collection that have been populated into full objects. The wire representation
  is a choice: TaskFlow's repositories decide when to populate and when to leave
  a bare id (Chapter 11 covers populate in depth).
- **ISO-8601 timestamps** — `createdAt`/`updatedAt` in UTC, added automatically
  by Mongoose's `timestamps: true` option.

> **In the TaskFlow repo** — the schema that produced this JSON,
> `backend/src/tasks/schemas/task.schema.ts` (excerpt):
>
> ```ts
> @Schema({ timestamps: true })
> export class Task {
>   @Prop({ required: true, trim: true })
>   title: string;
>
>   @Prop({ required: true, enum: TaskPriority, default: TaskPriority.MEDIUM })
>   priority: TaskPriority;
>
>   @Prop({ required: true, enum: TaskStatus, default: TaskStatus.TODO })
>   status: TaskStatus;
>
>   @Prop({ required: true, type: SchemaTypes.ObjectId, ref: 'Project' })
>   project: Types.ObjectId;
> }
> ```

### JSON vs. the JavaScript object it came from

A subtle point worth stating once, because it confuses beginners forever: the
JSON you see on the wire is *not* the JavaScript object in memory. The server
holds a Mongoose **document** — an object with methods (`.save()`, `.toObject()`)
and a type — and serializes it to plain JSON with `JSON.stringify`. The browser
receives a *string*, and parses it with `JSON.parse` into a fresh object.

The transformation from document to wire format is a real, deliberate step in
TaskFlow: repositories exclude the password hash (`.select('-passwordHash')`),
and the auth service explicitly strips it from responses:

```ts
const userObject = user.toObject();
const { passwordHash: _, ...userWithoutPassword } = userObject;
return userWithoutPassword;
```

This "shape the response" step — deciding exactly what crosses the wire — is a
recurring theme of this book (DTOs, projections, and lean queries all govern
it).

---

## 1.9 APIs — the contract between two programs

An **API (Application Programming Interface)** is the agreed contract between
two programs. In this book, the API is the boundary between the React frontend
and the NestJS backend: a set of routes, request shapes, response shapes, and
status codes that both sides implement independently.

Two frontend-facing ideas follow directly:

**The API client is a configuration, not magic.** The frontend does not know
NestJS exists. It knows one thing: "if I send this request, I get this JSON."
The axios instance in `frontend/lib/api.ts` encodes the contract's transport
details — base URL, cookies enabled, JSON content type.

**The DTO is the server side of the contract.** On the backend, a **DTO (Data
Transfer Object)** declares the *expected incoming shape* of a request. When a
client sends a body that violates the contract, the server rejects it — before
any business logic runs. Here is TaskFlow's contract for creating a task,
`backend/src/tasks/dto/create-task.dto.ts`:

```ts
export class CreateTaskDto {
  @IsNotEmpty({ message: 'Task title is required' })
  @IsString({ message: 'Title must be a string' })
  title: string;

  @IsNotEmpty({ message: 'Task description is required' })
  @IsString({ message: 'Description must be a string' })
  description: string;

  @IsNotEmpty({ message: 'Priority is required' })
  @IsEnum(TaskPriority, {
    message: `Priority must be one of: ${Object.values(TaskPriority).join(', ')}`,
  })
  priority: TaskPriority;

  @IsNotEmpty({ message: 'Due date is required' })
  @IsDateString({}, { message: 'Due date must be a valid date' })
  dueDate: string;

  @IsNotEmpty({ message: 'Project ID is required' })
  @IsMongoId({ message: 'Project must be a valid Mongo ID' })
  project: string;

  @IsNotEmpty({ message: 'Assignee ID is required' })
  @IsMongoId({ message: 'Assignee must be a valid Mongo ID' })
  assignee: string;
}
```

Read this as a lawyer reads a contract: every field is required, `title` and
`description` must be strings, `priority` must be one of the three enum values,
`dueDate` must be a parseable date, and `project`/`assignee` must be valid
MongoDB ObjectIds. A request missing any of these gets a `400 Bad Request`
before touching a controller, service, or database.

The frontend sends exactly this shape when Hanna creates a task:

```json
{
  "title": "Build the task dashboard",
  "description": "Implement the dashboard aggregate endpoint",
  "priority": "High",
  "dueDate": "2026-08-14",
  "project": "65d0b1a2c3d4e5f678901235",
  "assignee": "65d0a1b2c3d4e5f678901231"
}
```

> **In the TaskFlow repo** — the enforcement mechanism is global:
> `backend/src/main.ts` registers a `ValidationPipe` with strict options:
>
> ```ts
> app.useGlobalPipes(
>   new ValidationPipe({
>     whitelist: true,            // strip properties not in the DTO
>     forbidNonWhitelisted: true, // reject unknown properties outright
>     transform: true,            // convert JSON → DTO class instances
>   }),
> );
> ```
>
> `whitelist: true` alone *silently drops* unknown fields; adding
> `forbidNonWhitelisted: true` turns "you sent `isAdmin: true`" into a hard 400.
> This is the defense against **mass-assignment attacks** — a client trying to
> sneak extra fields like `role` or `status` into a request. We return to this
> in Chapter 25 (Security).

---

## 1.10 The full walkthrough

Now we assemble every layer. This section is the heart of the chapter: two
real TaskFlow requests, traced from the browser to MongoDB and back, with the
actual code at every step.

```
Browser
   ↓
React (Next.js)
   ↓
Axios
   ↓  HTTP over TCP (localhost:3001)
NestJS Controller
   ↓
Service
   ↓
Repository
   ↓  MongoDB driver
MongoDB (localhost:27017)
```

### Walkthrough A — login

**1. The browser.** Hanna types her email and password into the login form and
clicks **Sign in**. The React component collects the form state and calls the
auth context:

> `frontend/app/login/page.tsx` (excerpt):
>
> ```tsx
> const handleSubmit = async (e: FormEvent) => {
>   e.preventDefault();
>   setSubmitting(true);
>   try {
>     const user = await login(email, password);
>     router.push(homeForRole(user.role));
>   } catch (err: any) {
>     setError(err.response?.data?.message || 'Login failed. Check your credentials.');
>   } finally {
>     setSubmitting(false);
>   }
> };
> ```

**2. React.** The `login` function lives in `AuthContext.tsx`. It calls the
axios instance — which encodes the transport contract from §1.9:

> `frontend/contexts/AuthContext.tsx` (excerpt):
>
> ```tsx
> const login = useCallback(async (email: string, password: string) => {
>   const res = await api.post<{ accessToken: string; refreshToken: string; user: User }>(
>     '/auth/login',
>     { email, password },
>   );
>   setUser(res.data.user);
>   return res.data.user;
> }, []);
> ```

**3. Axios.** The axios instance (from §1.2) resolves `http://localhost:3001/api`,
appends the path `/auth/login`, sets `Content-Type: application/json`, enables
cookies (`withCredentials: true`), serializes the body with `JSON.stringify`,
and writes the HTTP request to the TCP socket:

```
POST /api/auth/login HTTP/1.1
Host: localhost:3001
Content-Type: application/json
Content-Length: 60

{"email":"hanna@taskflow.dev","password":"..."}
```

**4. NestJS — routing.** The request arrives at Express (NestJS's underlying
HTTP server) on port 3001. NestJS matches the path `/api/auth/login` to a route.
The global `/api` prefix was stripped; the `auth` controller and `login` method
handle the rest. The `ValidationPipe` from §1.9 validates the body against
`LoginDto` — malformed input dies here with 400.

> `backend/src/auth/auth.controller.ts` (the `@Public()` route from §1.6):
>
> ```ts
> @Public()
> @Post('login')
> @HttpCode(HttpStatus.OK)
> async login(
>   @Body() loginDto: LoginDto,
>   @Res({ passthrough: true }) res: Response,
> ) {
>   const user = await this.authService.validateUser(loginDto);
>   return this.authService.login(user, res);
> }
> ```

**5. Service — validate the credentials.** `AuthService.validateUser` looks up
the user by email (through the repository, not directly at MongoDB), checks the
account is active, and compares the submitted password against the stored
bcrypt hash:

> `backend/src/auth/auth.service.ts` (excerpt):
>
> ```ts
> async validateUser(loginDto: LoginDto): Promise<UserDocument> {
>   const user = await this.usersService
>     .findByEmailWithPassword(loginDto.email)
>     .catch(() => null);
>
>   if (!user) {
>     throw new UnauthorizedException('Invalid email address or password');
>   }
>
>   if (user.status === UserStatus.INACTIVE) {
>     throw new UnauthorizedException('Your user account has been deactivated...');
>   }
>
>   const isPasswordValid = await bcrypt.compare(loginDto.password, user.passwordHash);
>   if (!isPasswordValid) {
>     throw new UnauthorizedException('Invalid email address or password');
>   }
>   return user;
> }
> ```

Note the layered architecture already visible: the controller parses HTTP, the
service owns *business rules* (active check, password comparison), and the
service asks *another service* (UsersService) for data, which will ask the
repository for storage. Nothing here touches MongoDB directly — that is the
architectural discipline the entire book is built on.

**6. Repository — the data seam.** `UsersRepository.findByEmail` is the only
place that talks to the MongoDB `users` collection for this query:

> `backend/src/users/users.repository.ts` (excerpt):
>
> ```ts
> async findByEmail(email: string): Promise<UserDocument | null> {
>   return this.userModel.findOne({ email: email.toLowerCase() }).exec();
> }
> ```

**7. MongoDB — the database.** The MongoDB driver serializes the query,
connects to `localhost:27017`, and returns the matching document. Mongoose
hydrates it into a `UserDocument` — a typed object with methods — which flows
back up through the repository, service, and controller.

**8. Back down — sign the token.** Back in `AuthService.login`, TaskFlow signs
two JWTs (access, 30 minutes; refresh, 7 days), sets them as HTTP-only cookies,
and returns the user profile:

```ts
const payload: JwtPayload = {
  sub: user._id.toString(),
  email: user.email,
  role: user.role,
  version: user.refreshTokenVersion ?? 0,
};

const accessToken = this.jwtService.sign(payload, {
  secret: this.jwtConfiguration.accessSecret,
  expiresIn: this.jwtConfiguration.accessExpiresIn,
});
```

**9. The response travels back.** Express serializes the response, the
`Set-Cookie` headers ride along, and axios resolves the promise in the browser.
React stores the user in state, the router navigates Hanna to her dashboard,
and the browser now holds two HttpOnly cookies it will silently attach to every
future request to `localhost:3001`.

That is the full loop — about 9 steps, 7 files, 3 layers of abstraction, and
one round trip. Total time: tens of milliseconds.

### Walkthrough B — create a task

The second walkthrough adds two things the first lacked: **a protected route**
(the caller must be authenticated) and **a write** (a new document lands in
MongoDB).

**1. The browser already has cookies.** Hanna's browser automatically sends the
`access_token` cookie with every request — no JavaScript involved.

**2. Axios.** A `POST /api/tasks` with the `CreateTaskDto` shape from §1.9.

**3. Guard — authentication.** NestJS runs `JwtAuthGuard` (a global
`APP_GUARD`) before the controller method. It reads the cookie, verifies the
JWT signature and expiry (Chapter 13), and attaches the authenticated user to
the request:

```
POST /api/tasks HTTP/1.1
Host: localhost:3001
Cookie: access_token=eyJhbGciOiJIUzI1NiJ9...
Content-Type: application/json
```

**4. Guard — authorization.** `RolesGuard` (also global) checks Hanna's role
against the route's `@Roles(...)` metadata. `POST /api/tasks` is restricted to
Project Managers and Admins, so a Team Member gets `403 Forbidden` here — a
real, testable business rule (BR-001).

> `backend/src/tasks/tasks.controller.ts` (excerpt):
>
> ```ts
> @Roles(UserRole.PROJECT_MANAGER, UserRole.ADMIN)
> @Controller('tasks')
> export class TasksController {
>   @Post()
>   @HttpCode(HttpStatus.CREATED)
>   async create(
>     @Body() createTaskDto: CreateTaskDto,
>     @CurrentUser() user: UserContext,
>   ) {
>     return this.tasksService.create(createTaskDto, user._id.toString());
>   }
> ```

**5. Service — business rules.** `TasksService.create` validates the payload
against the domain: the project must exist, the assignee must be a member of
that project (BR-003), the due date must fall inside the project's dates
(BR-006). Only then does it construct the task and hand it to the repository.

**6. Repository — the write.** `TasksRepository.create` constructs a Mongoose
document and saves it:

> `backend/src/tasks/tasks.repository.ts` (excerpt):
>
> ```ts
> async create(data: Partial<Task>): Promise<TaskDocument> {
>   const task = new this.taskModel(data);
>   return task.save();
> }
> ```

**7. MongoDB.** The driver inserts the document; Mongoose applies the schema's
defaults (`status: 'To Do'`, `priority: 'Medium'`) and adds
`createdAt`/`updatedAt`. The saved document returns up the stack.

**8. The event fires.** `TasksService.create` emits a typed domain event —
`TaskAssignedEvent` — that the notification listener picks up asynchronously
and turns into a notification for the assignee. (This is the event-driven
pipeline we build across Chapters 18–21; for now, just know it happens *after*
the response is shaped, decoupled from the request.)

**9. The response.** `201 Created` with the new task as JSON. The frontend
receives it and re-renders the task list without a page reload.

Compare the two walks: Walkthrough A crossed auth-free territory; Walkthrough B
added two guards, three business rules, a database write, and a side-effect
event. Everything else — routing, DTO validation, repository isolation — was
identical. That consistency is the payoff of the layered architecture.

---

## 1.11 How TaskFlow fits into this — the map

You now have the vocabulary. Here is the permanent map, with the repo paths you
will see on almost every page of this book:

```
Browser (React, Next.js)                frontend/
  │  axios (withCredentials)            frontend/lib/api.ts
  ▼
HTTP/HTTPS (TCP:3001, /api prefix)
  ▼
NestJS application                      backend/src/
  ├─ main.ts            bootstrap, CORS, pipes, global prefix
  ├─ app.module.ts      composition root — everything wired together
  ├─ common/            shared machinery
  │   ├─ guards/        JwtAuthGuard, RolesGuard, ProjectMemberGuard
  │   ├─ decorators/    @CurrentUser, @Roles, @Public, @Task
  │   ├─ pipes/         ParseMongoIdPipe
  │   └─ filters/       AllExceptionsFilter
  ├─ auth/              login, tokens, session  (Chapter 13–14)
  ├─ users/             user CRUD + RBAC          (Chapter 8)
  ├─ teams/             team management           (Chapter 8)
  ├─ projects/          project lifecycle         (Chapter 8)
  ├─ tasks/             tasks, status machine     (Chapter 5)
  ├─ comments/          threaded comments         (Chapter 20)
  ├─ notifications/     events → notifications    (Chapters 18–21)
  ├─ reports/           aggregations              (Chapter 10)
  └─ database/          Mongo connection          (Chapters 10–12)
  ▼
MongoDB (TCP:27017)     collections: users, teams, projects, tasks, comments, notifications
```

Memorize the shape of this map, not the details. Every later chapter is a zoom
into one box: Chapter 4 zooms into the "NestJS application" box and explains
why it's structured this way; Chapter 5 traces one request through every file
in the `tasks/` box; Chapters 10–12 zoom into MongoDB; Chapters 13–14 zoom into
`auth/`. The map is the book.

---

### The ports one more time

Before moving on, resolve the ports into a single mental picture, because
Chapter 5 traces requests through them constantly:

```
Browser  ──▶ localhost:3000  (Next.js frontend)
                    │
                    │ axios, withCredentials
                    ▼
             localhost:3001  (NestJS API, /api prefix)
                    │
                    │ Mongoose driver
                    ▼
             localhost:27017 (MongoDB)
```

The frontend is a *client*; the API is a *server*; MongoDB is a *database*.
Three processes, three ports, three layers — and the request you traced in
§1.10 crossed all three in one direction, and the response crossed them back.

---

## 1.12 Common mistakes

**1. Confusing `localhost:3000` and `localhost:3001`.** The frontend is on
3000, the API on 3001. If you see "connection refused" or CORS errors, check
which port you're actually hitting.

**2. Believing HTTPS is optional "because it's just a demo."** Plaintext HTTP
exposes every password and token in transit. TaskFlow's cookies are only sent
over HTTPS in production (`secure: true`) — and production should always be
HTTPS.

**3. Using `POST` for everything.** It works, but it breaks idempotency,
caching, and REST clients' expectations. `GET` for reads, `POST` for creates,
`PATCH` for partial updates.

**4. Returning `200` for everything, including errors.** A wrong password is a
`401`, not a `200` with `{ success: false }` in the body. Status codes are part
of the contract; clients (and monitoring) depend on them.

**5. Returning the password hash "just for debugging."** TaskFlow goes to real
effort — `.select('-passwordHash')` in repositories, destructuring in services —
to keep hashes off the wire. Never be the developer who re-adds them.

**6. Sending `isAdmin: true` and hoping the server "just knows."** The server
only sees what the DTO allows (`whitelist` + `forbidNonWhitelisted`). Any
trusted field must be set server-side, never accepted from the client.

**7. Ignoring the blank line between headers and body.** When you hand-write an
HTTP request (in a socket, a test, or a debugging tool), forgetting the
`\r\n\r\n` separator breaks the entire parse. It looks trivial; it is the
protocol.

---

## Exercises

### 🟢 Concept

1. Name the four layers of the network stack a request crosses, from wire to
   application, and what each one is responsible for.
2. Why is `localhost` special? Which IP address does it resolve to, and where
   does that mapping live?
3. Explain the difference between `401 Unauthorized` and `403 Forbidden` in one
   sentence each.
4. What does "idempotent" mean, and why is `POST /api/tasks` *not* idempotent
   while `GET /api/tasks` is?
5. List the four REST constraints from §1.7 and, for each, say how TaskFlow
   satisfies it.

### 🟡 Code

6. In `backend/src/main.ts`, the global prefix is set to `'api'`. If you changed
   it to `'v1'`, what would the login URL become? What else would need to
   change in `frontend/lib/api.ts`?
7. Using `curl`, log in as `hanna@taskflow.dev`, capture the response, and
   identify: the status line, the `Set-Cookie` headers, and the JSON body.
   Then re-run with the wrong password and compare the status codes.
8. Open `backend/src/tasks/dto/create-task.dto.ts`. Add a new required field
   `estimateHours` (a number) to the DTO, and write the JSON body a client
   would need to send to pass validation.
9. In `backend/src/users/users.repository.ts`, find three methods that use
   `.select('-passwordHash')`. Explain in your own words why the repository —
   not the controller — enforces this.

### 🔴 Debug

10. A teammate reports: "I hit `GET /api/tasks` and got `403` — my login works,
    I can see my dashboard!" List three possible causes, in order of
    likelihood, and the file you'd open to verify each.

### ⚫ Mini-project

11. Use `curl` (or Postman) to trace a full TaskFlow flow end to end:
    log in as a seeded PM, create a project, create a task in it, change the
    task's status, and list the notifications. For each request, record the
    method, path, status code, and the key headers. You have just produced a
    mini "API contract" document — the raw material for Chapters 5 and 9.

---

## Interview questions

1. "Walk me through what happens when I type a URL and press Enter." — This is
   the single most asked interview question in web development. Structure your
   answer by layer: DNS → TCP → HTTP → application. You now have the full
   answer in §1.2–§1.6.
2. "What's the difference between HTTP and HTTPS?" — HTTP is plaintext;
   HTTPS is HTTP inside TLS, adding confidentiality and server authentication.
3. "What are the HTTP methods and their semantics?" — Name all five, and which
   are idempotent. Be ready to explain why `POST` isn't.
4. "What does a 4xx status mean vs a 5xx?" — Client error vs server error.
   Give examples from TaskFlow: 400 validation, 401 auth, 403 role, 404 not
   found, 500 crash.
5. "Why is REST stateless, and what does statelessness buy you?" — No server
   memory of sessions between requests → horizontal scaling is trivial.
   (Chapter 30 returns to this.)
6. "What's the difference between authentication and authorization?" — Authn =
   who you are (JWT); authz = what you may do (roles, guards).
7. "What is a DTO and why do you need one?" — The server-side request
   contract; validation, whitelisting, and type safety at the boundary.
8. "Why does the response to login include `HttpOnly` cookies instead of just
   a token in the body?" — XSS defense: JavaScript can't read HttpOnly cookies.
   (Full answer in Chapter 13.)
9. "What happens if I send `{"title": "x", "role": "Administrator"}` to
   `POST /api/tasks`?" — With `forbidNonWhitelisted`, a 400: the `role` field
   isn't in `CreateTaskDto`. With `whitelist` alone, it would be silently
   stripped. Either way, it can never reach the service.

---

## Key takeaways

1. **The Internet is layered.** Addresses (IP), connections (TCP), and
   languages (HTTP) are separate, cooperating protocols. Backend frameworks sit
   at the top of this stack and hide the bottom — until something breaks.
2. **HTTP is a text protocol with a rigid shape.** Method, path, headers, body.
   Status codes are the contract's truth: 2xx success, 4xx client error,
   5xx server error.
3. **REST structures the API around resources.** Nouns in URLs, verbs as
   methods, stateless requests. TaskFlow's routes are a direct expression of
   its business rules (BR-004's deactivate-not-delete is the clearest example).
4. **The DTO is the server's contract, enforced before business logic.**
   Validation, whitelisting, and type safety happen at the boundary — the
   frontend and backend meet exactly where the DTO says they do.
5. **Every request traces the same layered path.** Browser → axios → controller
   → service → repository → MongoDB, and back. Guards sit before the
   controller; DTO validation and pipes sit around it; events fire after it.
   Once you can trace one request, you can trace them all.

## Further reading

- *HTTP: The Definitive Guide* — Gourley & Totty (O'Reilly). The protocol,
  exhaustively.
- *High Performance Browser Networking* — Ilya Grigorik. Chapters 1–2 cover the
  transport layers better than anything else in print.
- [MDN: HTTP](https://developer.mozilla.org/en-US/docs/Web/HTTP) — the
  practical reference for methods, headers, and status codes.
- [RFC 9110 — HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110) — the
  spec itself, readable in an afternoon if you skip the grammar.

---

*In Chapter 2, we step inside the server: what Node.js actually is, how the
event loop runs your NestJS code, and why "single-threaded" is both true and
misleading.*

# 03 — Mongoose Schemas

**Sprint:** 1  
**Date:** 2026-07-26  
**Status:** Complete

---

## Design Source

```
SRS:      FR-002 (User Management), NFR-007 (password hashing), BR-007 (unique email)
Class:    User class, UserRole enum, UserStatus enum
Business: BR-004 (data retention on deactivation), BR-007 (unique identity)
```

---

## The Problem Schemas Solve

MongoDB stores documents as flexible JSON. Without a schema, you could store:

```json
{ "name": "Ali" }
{ "email": "ali@example.com", "role": "admin" }
{ "firstName": "Ali", "foo": "bar" }
```

All three would be accepted into the same `users` collection. You'd have no
guarantee that a User document has an email, a password, or a role.

Mongoose adds structure back. A schema says:
> "Every document in this collection must look like this."

---

## How NestJS + Mongoose Works Together

`@nestjs/mongoose` provides TypeScript decorators that let you define a schema
as a class. This gives you two things in one file:

1. The **TypeScript type** — what a User looks like in your code
2. The **MongoDB schema** — what a User document looks like in the database

Without this approach, you'd maintain two separate definitions and keep them in sync manually.

---

## Key Decorators Explained

### `@Schema()`

```
@Schema({ timestamps: true })

What it does:   → Marks this class as a Mongoose schema definition
Who reads it:   → @nestjs/mongoose at startup
When:           → Application bootstrap
Why needed:     → Without it, SchemaFactory.createForClass() won't work
Without it:     → The class is just a plain TypeScript class — Mongoose ignores it

timestamps: true → Automatically adds createdAt and updatedAt fields to every document.
                   You get a free audit trail without writing any logic.
```

### `@Prop()`

```
@Prop({ required: true, unique: true, lowercase: true })

What it does:   → Defines a field in the MongoDB document
Who reads it:   → Mongoose when building the schema
When:           → Application bootstrap
Why needed:     → Without @Prop(), the property exists only in TypeScript
                  and is NOT stored in MongoDB
Without it:     → The field is invisible to the database
```

Options you'll see on `@Prop()`:

| Option | Purpose |
|---|---|
| `required: true` | MongoDB rejects documents missing this field |
| `unique: true` | Creates a unique index — no two documents can share this value |
| `lowercase: true` | Stores value in lowercase — prevents case-sensitivity bugs |
| `trim: true` | Strips leading/trailing whitespace automatically |
| `enum: UserRole` | Restricts value to the defined enum values |
| `default: value` | Sets a default when no value is provided |

---

## Why `HydratedDocument<User>`?

When Mongoose retrieves a document from MongoDB, it returns more than your data:

- `_id` — MongoDB's unique identifier
- `__v` — version key for optimistic concurrency
- `.save()` — method to persist changes
- `.toObject()` — method to convert to a plain object

`HydratedDocument<User>` is the TypeScript type that represents this full object.
Using just `User` would mean TypeScript doesn't know about `_id` or `.save()`.

---

## Why Enums Match the UML Exactly

```typescript
export enum UserRole {
  ADMIN = 'Administrator',       // matches UML class diagram
  PROJECT_MANAGER = 'ProjectManager',
  TEAM_MEMBER = 'TeamMember',
}
```

The string values (`'Administrator'`, `'ProjectManager'`, `'TeamMember'`) get
stored in MongoDB documents. If you change these strings later, every existing
document in the database becomes invalid — `role: 'Administrator'` won't match
`UserRole.ADMIN = 'Admin'`.

**Rule:** Design your enums once, get them right, and never rename the string values.

---

## Why `unique: true` on Email?

BR-007 requires that no two users share the same email address.

You could enforce this in the service layer:

```typescript
const existing = await this.usersRepository.findByEmail(email);
if (existing) throw new ConflictException('Email already in use');
```

But this has a race condition: two requests arriving simultaneously could both
pass the check before either creates the document.

`unique: true` creates a **database-level index** that rejects duplicates
atomically. Even if the service layer has a bug, the database won't allow it.

This is defense in depth — enforce the constraint at every layer.

---

## Behind the Scenes

```
When NestJS starts:
1. UsersModule is loaded by AppModule
2. MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]) is called
3. Mongoose sends the schema definition to MongoDB Atlas
4. MongoDB creates the "users" collection if it doesn't exist
5. MongoDB creates the unique index on the "email" field
6. DI container registers the User model under the token User.name ("User")
7. Any class can now receive the model via @InjectModel(User.name)
```

---

## Engineering Notes

| Question | Answer |
|---|---|
| What problem does this file solve? | Defines structure and constraints for User documents in MongoDB |
| Why this pattern? | Decorator-based schemas keep TypeScript type and DB schema in sync automatically |
| Without this file? | MongoDB accepts any document shape — no validation at the database level |
| How does it talk to the next layer? | UsersRepository injects the Mongoose model generated from this schema |
| SOLID principle? | Single Responsibility — defines structure only, no business logic |
| Design pattern? | Schema/Model pattern — separates data structure definition from data access logic |

---

## Common Mistakes

- ✗ Naming the field `password` instead of `passwordHash` — misleads developers
- ✗ Forgetting `lowercase: true` on email — `User@Example.com` and `user@example.com` become different users
- ✗ Not adding `unique: true` — relies only on service validation, which has race conditions
- ✗ Changing enum string values after data is in the database — breaks all existing documents
- ✗ Not using `HydratedDocument<T>` — TypeScript won't know about `_id` and Mongoose methods

---

## Key Takeaways

- Mongoose schemas enforce document structure in a schema-less database
- `@Schema()` marks the class, `@Prop()` marks each field
- `HydratedDocument<T>` is the correct TypeScript type for a Mongoose document
- Enums must match the UML class diagram exactly — string values are stored in the DB
- `unique: true` enforces constraints at the database level, not just in code
- `timestamps: true` gives free `createdAt` and `updatedAt` fields
- Defense in depth: enforce the same constraint at both the service layer and database level

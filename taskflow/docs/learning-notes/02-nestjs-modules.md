# 02 — NestJS Modules & Dependency Injection

**Sprint:** 1  
**Date:** 2026-07-26  
**Status:** Complete

---

## The Problem NestJS Solves

Plain Node.js/Express gives you maximum freedom — you can put anything anywhere.
That freedom is also the problem. As an application grows:

- Every developer organizes code differently
- Dependencies become tangled (`new UserService()` scattered everywhere)
- Testing requires spinning up the entire app
- Features become tightly coupled — changing one breaks another

NestJS solves this with three ideas: **Modules**, **Dependency Injection**, and **Decorators**.

---

## What is a Module?

A module is a self-contained unit that groups related code together.

```typescript
@Module({
  imports: [],      // other modules this module needs
  controllers: [],  // HTTP handlers that belong here
  providers: [],    // services, repositories — things that can be injected
  exports: [],      // providers that other modules can use
})
export class UsersModule {}
```

Every NestJS application has one root module (`AppModule`) that imports all
feature modules. NestJS reads this tree to build the dependency graph.

**Why do modules exist?**
They make the dependency graph explicit. When you look at `AppModule`,
you can see exactly which features the application has and how they relate.
Without modules, all classes would be in one global namespace — impossible to maintain.

---

## What is Dependency Injection?

Dependency Injection (DI) means: you declare what you need, and a framework gives it to you.

Without DI:
```typescript
// You create the dependency yourself
class AuthController {
  private authService: AuthService;

  constructor() {
    this.authService = new AuthService(); // tightly coupled
  }
}
```

Problems:
- `AuthController` controls how `AuthService` is created
- If `AuthService` needs a database connection, `AuthController` has to know about that too
- Testing requires real instances of everything — you can't swap in a fake

With DI:
```typescript
// You declare what you need — NestJS creates and provides it
class AuthController {
  constructor(private authService: AuthService) {}
  // NestJS handles creation and injection
}
```

Benefits:
- `AuthController` doesn't know or care how `AuthService` is built
- Testing: inject a mock `AuthService` — no real database needed
- NestJS manages object lifetimes — services are singletons by default

---

## The IoC Container

IoC stands for **Inversion of Control**. Instead of your code controlling
when and how dependencies are created, the framework controls it.

When NestJS starts:
1. It reads all `@Module()` decorators to build a dependency graph
2. It reads all `@Injectable()` decorators to know what can be injected
3. It instantiates classes in the correct order (dependencies first)
4. It injects the right instances into the right constructors

You never call `new UserService()` — NestJS does it once and reuses the same
instance everywhere it's needed (singleton scope by default).

---

## What is `@Injectable()`?

```
@Injectable()

What it does:   → Marks a class as a provider that can be managed by NestJS DI
Who reads it:   → NestJS IoC container at startup
When:           → Application bootstrap
Why needed:     → Without it, NestJS won't know to register the class as injectable
Without it:     → You'll get a "Nest can't resolve dependencies" error at runtime
```

---

## What is `@Module()`?

```
@Module({ imports, controllers, providers, exports })

What it does:   → Defines the metadata for a module
Who reads it:   → NestJS module system at startup
When:           → Application bootstrap
Why needed:     → Tells NestJS which classes belong together and how modules relate
Without it:     → NestJS has no way to organize or wire the application
```

---

## Module Communication

Modules are isolated by default. To share a provider between modules:

```typescript
// UsersModule exports UsersService
@Module({
  providers: [UsersService],
  exports: [UsersService],   // make it available to importing modules
})
export class UsersModule {}

// AuthModule imports UsersModule to access UsersService
@Module({
  imports: [UsersModule],    // now AuthService can inject UsersService
  providers: [AuthService],
})
export class AuthModule {}
```

**Why this design?**
Explicit exports make the public API of a module clear. You can see exactly
what a module exposes without reading every file inside it.

---

## Global Modules

Some modules are needed everywhere — `ConfigModule` is a good example.
Marking it `isGlobal: true` registers it globally so other modules don't
need to import it explicitly.

This is the exception, not the rule. Global modules hide dependencies.
Only use global registration for true cross-cutting concerns like configuration.

---

## SOLID Principles Applied

- **Single Responsibility** — each module has one domain concern
- **Open/Closed** — add new modules without modifying existing ones
- **Dependency Inversion** — high-level modules depend on abstractions (interfaces/tokens), not concretions

---

## Key Takeaways

- Modules group related code and make dependencies explicit
- DI means declaring what you need, not creating it yourself
- The IoC container builds and manages object instances
- `@Injectable()` registers a class with the container
- `@Module()` defines the metadata NestJS uses to wire everything
- Modules are isolated by default — use `exports` to share providers
- Only use `isGlobal: true` for genuine cross-cutting concerns

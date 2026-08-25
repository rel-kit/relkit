## Why

Route middleware is currently modeled as serializable metadata targeting a function, which prevents normal Hono gate semantics and couples HTTP concerns to reusable functions. Function and service APIs also expose an optional HTTP request even though most invocation sources have no request.

## What Changes

- **BREAKING** Replace function-backed route middleware with path-scoped Hono-compatible handlers declared through `defineMiddleware(path, handler)`.
- **BREAKING** Remove route middleware arrays and infer route-to-middleware relationships from supported path patterns.
- Add function and tool `onBefore` and `onAfter` value-transforming lifecycle hooks.
- **BREAKING** Remove the optional request argument from function handlers and service middleware.
- Add middleware and generated hook graph projections plus middleware inspector navigation and route links.
- Keep middleware responses runtime-only; typed middleware response contracts are deferred.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `public-authoring`: Replace function-backed middleware and transport-aware function signatures with path-scoped middleware and transport-independent handlers/hooks.
- `function-runtime`: Execute function lifecycle hooks through the common validated invocation pipeline without an HTTP request argument.
- `http-runtime`: Register middleware with native Hono ordering and map requests only after middleware continuation.
- `compiler-graph`: Compile path coverage, first-class middleware nodes, generated hook nodes, and versioned manifest bindings.
- `tools-agents`: Add approval-safe tool lifecycle hooks around target function execution.
- `service-orchestration`: Remove transport request access and define ordering relative to function hooks.
- `development-inspector`: Add middleware list/detail navigation and linked route relationships.

## Impact

This changes the public routes, functions, tools, and services packages; compiler graph and manifest formats; the invocation engine and Hono runtime; inspector APIs/UI; examples, templates, tests, and documentation. Graph and manifest versions advance together, and existing middleware and function/service handler signatures require migration.

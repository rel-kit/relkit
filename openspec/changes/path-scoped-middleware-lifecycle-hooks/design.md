## Context

See `proposal.md` for motivation. Current middleware descriptors target functions through request and decision mappings, route descriptors list middleware explicitly, function and service APIs carry an optional framework-neutral HTTP request, and the graph projects middleware only as route configuration targeting functions. The Hono runtime already provides native path middleware and onion composition.

## Goals / Non-Goals

**Goals:**

- Make route middleware native to the HTTP layer while retaining deterministic compiler and inspector projections.
- Keep reusable function, tool, and service execution independent of HTTP transport.
- Add value-transforming lifecycle hooks without adding a second invocation engine.

**Non-Goals:**

- Static schemas for middleware-produced responses.
- Full Hono regex and optional path grammar.
- Method-specific middleware or compatibility shims for removed APIs.

## Decisions

### Native Hono registration with serializable descriptors

`defineMiddleware(path, handler)` returns a source-identifiable descriptor containing the supported path pattern and executable handler. The manifest binds the handler, while the graph stores only ID, path, order, source, and route relationships. Runtime materialization registers all middleware with `app.use` before routes. This preserves Hono short-circuit and onion behavior instead of recreating it in Effect or the route executor.

### Deterministic convention order

Middleware is sorted by canonical descriptor ID. The same order is used for manifest registration, graph projection, OpenAPI metadata, and inspector display. This reuses the compiler's descriptor ordering and avoids a second application registration API.

### Analyzable Hono-compatible path subset

The public grammar accepts global `*`, static segments, named parameters, and a terminal wildcard. A segment matcher compares these patterns with file-derived route segments, classifying complete coverage as `always` and partial catch-all overlap as `conditional`. Runtime requests still use Hono's matcher.

### HTTP data stops at route mapping

The Hono context remains available only to route middleware and mapping. Validated Hono values overlay raw parameter, query, header, cookie, JSON, and form sources. The engine no longer materializes or passes `FunctionRequest`; handlers and service middleware receive input and execution context only.

### Hooks are owner callbacks in the common pipeline

Function hooks are bound with their function and use its dependency-aware context. Service middleware wraps the entire function lifecycle. Tool hooks wrap target invocation after validation and approval; their context contains base execution utilities, and managed side effects are performed through invoked functions. Each present hook is represented by a generated graph node with owner and phase, but is not independently invokable.

### Validation surrounds every transform

Initial input is validated before `onBefore`, the transformed input is validated before the handler, handler output is validated before `onAfter`, and transformed output is validated before returning. Failures skip later stages and use existing normalization.

## Risks / Trade-offs

- [Source-derived middleware IDs control order, so moves can change execution] → Show the effective order in compiler output and inspector.
- [Catch-all routes can be only partially covered] → Preserve runtime matching and label the static relationship `conditional`.
- [Removing request arguments breaks existing handlers and tests] → Produce source-located compiler/type errors and migrate all repository examples and templates in the same change.
- [Middleware responses are absent from generated clients] → Keep them runtime-only now and add an explicit response-contract feature only when typed SDK requirements are designed.

## Migration Plan

1. Advance graph and manifest versions and change descriptor/runtime types together.
2. Replace old middleware declarations with path handlers and remove route middleware arrays.
3. Convert handlers and service middleware to request-free signatures.
4. Add hooks, graph/manifest projections, inspector views, and migrations across examples and templates.
5. Run focused type, compiler, engine, Hono runtime, inspector, and integration checks before full local verification.

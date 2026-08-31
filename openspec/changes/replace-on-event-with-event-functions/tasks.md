## 1. Public Contracts

- [x] 1.1 Bump affected contract versions and change event descriptors from required `payload`/`version` to `input` plus optional version defaulting to `1`.
- [x] 1.2 Add registry-driven `publishes` typing to normal functions, remove `dependencies.events`, and narrow `context.events` by exact event IDs.
- [x] 1.3 Add the distinct `defineEventFunction` API, event-only descriptor/context types, shared internal function factory, validation, and focused type/runtime tests.
- [x] 1.4 Remove public listener, selector, callback, and compatibility exports and their obsolete implementation modules.

## 2. Compiler, Graph, and Manifest

- [x] 2.1 Normalize event functions into authored event-only function nodes plus deterministic exact-event trigger nodes without hidden functions or selector expansion.
- [x] 2.2 Add known/duplicate publication, event-function field/result, target-path, and generated-trigger collision diagnostics.
- [x] 2.3 Update graph/registration/manifest contracts and event registry generation for event input, invocation mode, exact trigger configuration, and authored handlers.

## 3. Runtime and Providers

- [x] 3.1 Enforce event-only admission for delivery/replay and reject direct, nested, HTTP, service, job/schedule, tool, and agent paths even for forged inputs.
- [x] 3.2 Build publisher clients exclusively from `publishes`, preserve exact observed/declared edges, and provide the structured event-function trigger context.
- [x] 3.3 Preserve local/cloud validation, fan-out, retry, replay, dead-letter, cancellation, and declared-error behavior through authored event functions.

## 4. Product Surfaces

- [x] 4.1 Update Inspector event/function models and views to derive authored consumers from trigger edges while retaining runtime delivery state.
- [x] 4.2 Update deployment planning, EventBridge/SQS resources, IAM snapshots, and provider permissions for exact publications and generated triggers.
- [x] 4.3 Rewrite all repository examples, templates, fixtures, tests, documentation, and generated references to `input`, `publishes`, and `defineEventFunction`.

## 5. Verification

- [x] 5.1 Run focused type, event/function, compiler/graph, runtime/provider, Inspector, generator/example, documentation, and deployment suites and fix regressions.
- [x] 5.2 Run `bun run typecheck`, `bun run check`, `bun run test:all`, `bun run build`, and `bun run verify` without cloud acceptance.
- [x] 5.3 Run strict OpenSpec validation, confirm legacy API scans are clean, and record verification evidence.

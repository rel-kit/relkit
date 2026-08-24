## 1. Public lifecycle APIs

- [x] 1.1 Make function handlers request-free and add typed `onBefore`/`onAfter` callbacks to function descriptors and tool views.
- [x] 1.2 Remove request access from service middleware while preserving scoped context enrichment and onion policy.
- [x] 1.3 Execute and validate function and tool hooks in the common engine with the specified service and approval ordering.

## 2. Path-scoped middleware

- [x] 2.1 Replace function-backed middleware and route arrays with `defineMiddleware(path, handler)` and the supported path grammar.
- [x] 2.2 Add deterministic middleware coverage classification and first-class middleware/generated hook graph nodes.
- [x] 2.3 Generate versioned executable middleware/hook manifest bindings and register middleware natively before Hono routes.
- [x] 2.4 Overlay Hono validated values during request mapping and remove `FunctionRequest` from the invocation boundary.

## 3. Inspector and generated contracts

- [x] 3.1 Extend inspector API models and graph navigation for middleware nodes and linked route coverage.
- [x] 3.2 Add middleware list/detail pages and route links with order and conditional coverage labels.
- [x] 3.3 Update OpenAPI metadata, generated clients where affected, and graph/manifest version validation.

## 4. Migration and verification

- [x] 4.1 Migrate examples, templates, fixtures, tests, and documentation to the breaking APIs.
- [x] 4.2 Add focused lifecycle, middleware matching/runtime, compiler, and inspector regression coverage.
- [x] 4.3 Run focused checks followed by repository typecheck, check, build, and local test suites; record any unrelated dirty-worktree failures.

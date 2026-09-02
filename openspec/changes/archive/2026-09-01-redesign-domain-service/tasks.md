## 1. Public Contracts and Authoring

- [x] 1.1 Bump contract, graph, manifest, and generator versions and update shared descriptor/graph unions for domain and error data.
- [x] 1.2 Replace service middleware/member cloning with direct function/event service facades and focused type/runtime tests.
- [x] 1.3 Add `defineServiceRoutes`, raw-route auth protection options, exports, type tests, and route unit tests.
- [x] 1.4 Replace eager data-model authoring with `defineDrizzleService` and `defineModel`, reusing CRUD/transaction binding and adding lifecycle/type tests.
- [x] 1.5 Replace `betterAuthAdapter` with lazy `defineBetterAuthService`, native option typing, handler branding, activation helpers, and tests.

## 2. Compiler and Generated Contracts

- [x] 2.1 Rewrite source ID and convention rules for `src/<domain>`, `src/routes`, and `src/platform`, including legacy-layout diagnostics.
- [x] 2.2 Add domain/service export validation, ownership/exposure assignment, orphan detection, and public-member validation.
- [x] 2.3 Collect and resolve application import facts, enforce domain boundaries, and emit deduplicated service dependency edges.
- [x] 2.4 Add source facts and lowering for destructured `defineServiceRoutes` exports and Better Auth mounts/base paths.
- [x] 2.5 Add ErrorNode normalization plus domain/service nodes and new graph edges, removing service middleware and data-model graph concepts.
- [x] 2.6 Generate the unified services manifest and typed env/database/auth context registry from specialized services.
- [x] 2.7 Update registration plans, OpenAPI/client projection, graph hashing/diffing, and contract snapshots for the new versions.

## 3. Runtime and Inspector

- [x] 3.1 Integrate provider/Drizzle/Better Auth startup, complete readiness gating, function context, draining, and Drizzle disposal into generated runtime.
- [x] 3.2 Extend route middleware context with typed auth/env and register declarative auth protection before authored middleware.
- [x] 3.3 Extend compiled-project testing helpers with specialized service/raw-route activation and idempotent close.
- [x] 3.4 Add Inspector errors collection, Domains navigation/list/detail views, public/internal grouping, dependency links, and safe specialized metadata.

## 4. Migration and Documentation

- [x] 4.1 Migrate minimal, API, and agent templates plus generator/smoke expectations to domain-first structure.
- [x] 4.2 Migrate commerce, data-model, and auth-drizzle examples and their tests to domain/database/auth services.
- [x] 4.3 Update public API documentation, domain/service/database/auth guides, migration guidance, generated references, and the discussion plan's resolved decisions.
- [x] 4.4 Remove all remaining public/internal uses of service middleware, `defineDataModel`, `data-model`, and `betterAuthAdapter` outside explicit migration fixtures.

## 5. Verification

- [x] 5.1 Run focused service, route, Drizzle, Better Auth, compiler, runtime, Inspector, generator, example, and documentation tests and fix regressions.
- [x] 5.2 Run `bun run typecheck`, `bun run check`, `bun run test:all`, `bun run build`, and `bun run verify` without cloud acceptance.
- [x] 5.3 Validate the OpenSpec change strictly and record final task completion/evidence.

## Verification Evidence

- 2026-08-30: `bun run typecheck`, `bun run check`, `bun run test:all`, `bun run build`, and `bun run verify` passed.
- Cloud deployment acceptance remained skipped as required; all 10 local Inspector E2E tests passed.
- Release readiness packed all 36 packages and exercised all three generated templates successfully.
- `openspec validate redesign-domain-service --strict` passed.

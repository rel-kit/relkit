## 1. Contract and Baseline

- [x] 1.1 Strictly validate the OpenSpec proposal, design, and all ten capability deltas; fix every artifact error before implementation
- [x] 1.2 Run the existing route, event, CLI, generator, inspector, and phase-zero focused suites to establish a clean behavioral baseline

## 2. Convention-First HTTP Authoring

- [x] 2.1 Add tested route-file segment parsing for root, static, dynamic, required catch-all, optional catch-all, malformed segments, precedence, and normalized variants
- [x] 2.2 Make `defineRoute` accept compiler-supplied method/path plus optional request/responses, `successStatus`, `maxBodyBytes`, and validated rate-limit metadata without leaking runtime types
- [x] 2.3 Update discovery/evaluation to recognize named HTTP-method exports in `src/routes/**/route.ts` and emit migration diagnostics for legacy/default/method/path authoring
- [x] 2.4 Normalize inferred request mappings and responses from target schema/error projections, including explicit-override and unprojectable-schema diagnostics
- [x] 2.5 Lower catch-all variants through graph planning, Hono registration, OpenAPI, compatibility diffing, and generated client path encoding while preserving one route ID
- [x] 2.6 Add `z.file`, single/repeated multipart sources, server/route body limits, file validation, JSON Schema projection, and focused schema/HTTP tests
- [x] 2.7 Add graph-visible rate-limit normalization, cache references, production validation, inferred `429`, and OpenAPI/client metadata
- [x] 2.8 Add the isolated Hono rate-limiter adapter, local/shared stores, middleware ordering, safe headers/responses, request/span telemetry, and two-runtime contract tests
- [x] 2.9 Serve active OpenAPI and Scalar endpoints with development defaults, protected production opt-in, CLI/inspector links, and security tests

## 3. Typed Callback Events

- [x] 3.1 Redesign `onEvent` and selectors around augmentable typed event-name strings, payload-first callback context, durable defaults, listener options, and public type tests
- [x] 3.2 Generate the deterministic atomic event registry before type checking and validate unknown/stale names across create, check, and watch flows
- [x] 3.3 Lower callbacks into generated function nodes/manifest handlers with stable listener IDs, dependencies, envelope context, and common-engine invocation
- [x] 3.4 Update local/test/AWS event materialization, recovery/fan-out tests, inspector projections, templates, and event documentation for callback listeners

## 4. Configuration, CLI, and Packaged Development

- [x] 4.1 Add `@zsys/app/config` typed configuration, fixed project paths/exclusions, legacy-key diagnostics, and migrate compiler/supervisor callers
- [x] 4.2 Centralize backend/inspector port precedence and body/API-doc settings across dev, start, build-server, doctor, deployment validation, and templates
- [x] 4.3 Replace manual CLI dispatch parsing with an Effect CLI command tree while preserving handlers, JSON/stdout/stderr/exit contracts and fixing every nested help path
- [x] 4.4 Generate shell completions and a deterministic JSON-safe CLI help model from the same command tree with snapshot coverage
- [x] 4.5 Update minimal/API/agent templates and generator tests to the route, event, config, port, OpenAPI, and printed first-run contracts
- [x] 4.6 Package the built inspector with the CLI, keep only a contributor override, and add an external packed-project dev/start/shutdown smoke test

## 5. Canonical Executable Example

- [x] 5.1 Move the former commerce fixture into `examples/commerce`, register `examples/*`, and update every script, test, TypeScript reference, boundary rule, and document path without a duplicate alias
- [x] 5.2 Expand commerce routes/tests to cover all methods, segment forms, inference/overrides, JSON/multipart uploads, middleware, limits, rate limiting, OpenAPI, and Scalar
- [x] 5.3 Convert commerce events to callback listeners and confirm jobs, resources, tools, agents, observability, local/test/AWS profiles, and restart behavior remain covered
- [x] 5.4 Add the examples feature index and package-owned check/type/test/build tasks, then wire `test:examples` through Turborepo and repository verification

## 6. Searchable Generated Documentation

- [x] 6.1 Add the Next/Fumadocs documentation workspace with package-local tasks, accessible self-hosted search, navigation, theme, build outputs, and link checks
- [x] 6.2 Reorganize existing docs into complete getting-started, fundamentals, HTTP, async, resources/AI, tooling/operations, troubleshooting, and breaking-migration guides tied to executable examples
- [x] 6.3 Add rich Effect-style JSDoc to application-facing exports and deterministic `@effect/docgen` API reference generation with metadata/doctest quality gates
- [x] 6.4 Generate the CLI reference from command metadata plus `/llms.txt` and `/llms-full.txt` from the docs content manifest, with stale-output/search tests

## 7. Inspector Redesign

- [x] 7.1 Read the installed Next 16 guidance, then add Tailwind v4 and only the used shadcn React Aria primitives with a responsive themed shell, sidebar, search, health, generation, and graph hash
- [x] 7.2 Consolidate resource list/filter/pagination/loading/error/detail-sheet behavior while preserving server-side semantics, canonical detail URLs, safe source links, and local action security
- [x] 7.3 Replace the graph canvas with accessible React Flow pan/zoom/fit/minimap/search/kind filtering/details while retaining deterministic positions and the relationship table fallback
- [x] 7.4 Rebuild trace detail as a redacted expandable span tree/waterfall with zoom, search, error filtering, safe attributes/logs, and correlated navigation
- [x] 7.5 Add the API Reference destination and connect route details/composer to the active Scalar/OpenAPI generation
- [x] 7.6 Run React Doctor and focused inspector unit/Playwright keyboard, mobile, theme, graph, trace, sheet, and API-reference checks; fix all actionable findings

## 8. Release Verification and Handoff

- [x] 8.1 Update AGENTS, changelog, package READMEs, migration notes, dependency/boundary rules, and generated-artifact expectations to the new public topology
- [x] 8.2 Validate structural configuration, run the consistency audit without weakening evidence-based rules, and resolve violations introduced by this change
- [x] 8.3 Run formatting, lint, type/type-fixture, compiler, contract, integration, restart, inspector, generator, packed, build, security, and full `verify` gates; record unavailable cloud checks honestly
- [x] 8.4 Re-run strict OpenSpec validation, confirm every task and acceptance scenario has evidence, and leave the completed change ready for archive

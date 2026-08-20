## Why

ZSYS exposes most framework primitives, but developers currently have to repeat transport metadata, discover event wiring and configuration conventions from implementation code, and work around incomplete CLI help, documentation, local packaging, and inspector ergonomics. This change makes the existing runtime and graph capabilities approachable through convention-first authoring, executable documentation, and a cohesive local-development experience.

## What Changes

- **BREAKING** Replace one-descriptor `*.route.ts` files with Next-style `src/routes/**/route.ts` files whose named HTTP-method exports derive method and path from the file system.
- **BREAKING** Make routine route request/response contracts inferred from target function schemas while retaining explicit mappings for non-default transports.
- Add bounded file schemas, repeated multipart fields, per-route body limits, cache-backed route rate limits, and deterministic OpenAPI coverage for each.
- **BREAKING** Replace target-function event listeners with typed string-name callback listeners backed by a generated event registry and lowered through the existing function engine.
- **BREAKING** Replace configurable source/glob/output paths with fixed project conventions and add typed server, inspector, body-limit, API-reference, and port configuration.
- Expose development OpenAPI and Scalar endpoints with explicit protected production opt-in.
- Replace manual CLI parsing with the repository's existing Effect CLI module, preserving machine output while fixing nested help and adding generated completions/reference data.
- Add a searchable Fumadocs application, generated public API and CLI references, executable examples, AI-readable documentation exports, and a breaking-change migration guide.
- Move the commerce fixture into a canonical workspace example that proves every public capability and participates in repository verification.
- Package the inspector with the CLI and modernize its accessible shell, resource views, graph, trace waterfall, and API reference using Tailwind, shadcn's React Aria base, and React Flow.

## Capabilities

### New Capabilities

- `developer-documentation`: Searchable guides, generated API and CLI references, executable examples, migration documentation, and AI-readable documentation output.

### Modified Capabilities

- `public-authoring`: Convention-first route files, inferred HTTP contracts, typed callback events, file schemas, rate-limit options, and typed configuration.
- `compiler-graph`: Route-file discovery, inference and collision validation, callback-listener lowering, generated event registry output, and graph-visible HTTP policies.
- `http-runtime`: Catch-all materialization, inferred request/response behavior, multipart limits, rate limiting, OpenAPI endpoints, and Scalar reference serving.
- `jobs-events`: Durable callback listener semantics, typed selectors, generated-name validation, retry/redrive behavior, and engine-mediated delivery.
- `cli-scaffolding`: Nested command help, completions, convention-based templates, config/port precedence, documentation metadata, and packaged local development.
- `development-inspector`: Accessible dashboard shell, reusable resource views, interactive graph, trace waterfall, and API reference navigation.
- `observability`: Rate-limit telemetry and accessible presentation of existing trace/span relationships without weakening redaction.
- `workspace-foundation`: Documentation and example workspaces, package task wiring, fixed source conventions, and publishable inspector assets.
- `acceptance-verification`: Coverage for route inference, events, rate limits, docs, examples, CLI help, packaged development, and inspector accessibility.

## Impact

- Affects public APIs in `@zsys/app`, `@zsys/schema`, `@zsys/routes`, and `@zsys/events`, plus compiler graph contracts, Hono runtime materialization, OpenAPI/client generation, CLI/config loading, templates, deployment validation, the inspector, and repository tests.
- Adds runtime dependencies only where required: `hono-rate-limiter`, Scalar's Hono integration, Fumadocs, Tailwind/shadcn React Aria components, and `@xyflow/react`; API reference generation reuses the repository's Effect version through published Effect tooling.
- Moves the former commerce acceptance fixture into `examples/commerce` and adds `examples/*` to the Bun/Turborepo workspace.
- Requires a documented pre-1.0 migration; no compatibility adapter or codemod is provided.

## Context

See `proposal.md` for motivation. The current system already has immutable descriptors, controlled compiler evaluation, a canonical graph, generic triggers, generated OpenAPI/client output, one function-engine invocation boundary, Hono materialization, durable event providers, a last-known-good supervisor, protected inspector APIs, and a functional Next inspector. The change must simplify application authoring without bypassing those boundaries or placing executable closures in the graph.

The repository is a strict Bun/Turborepo workspace, public TypeScript must not expose Effect/Hono/Next/Pulumi types, implementation files remain at most 200 lines, and `repos/effect` is reference-only. This is a pre-1.0 breaking change, so migration diagnostics and documentation replace compatibility adapters.

## Goals / Non-Goals

**Goals:**

- Make the common route and event paths require only stable identity, target/callback, and business schemas.
- Keep every generated graph, manifest, OpenAPI document, client, event registry, and help/reference artifact deterministic and content-addressed.
- Reuse the current compiler, engine, provider, observability, supervisor, and inspector API contracts.
- Make a packed generated project independently usable and make documentation/examples executable release evidence.
- Improve inspector navigation and visualization without weakening accessibility, redaction, or production controls.

**Non-Goals:**

- Compatibility shims, codemods, decorators/controllers, route groups, parallel/intercepting routes, streaming uploads, arbitrary rate-limit callbacks, alternate deployment engines, a subscription resource, a second Swagger UI, an inspector graph layout service, or an embedded third-party tracing backend.
- Removing function input/output Standard Schemas; runtime validation and deterministic projection still require them.
- Changing telemetry storage/wire contracts solely to support the inspector redesign.

## Decisions

### 1. Route files are a compiler convention, not a runtime router dependency

The discovery layer will recognize only named HTTP-method exports in `src/routes/**/route.ts`. A focused parser will translate static, `[name]`, `[...name]`, and `[[...name]]` segments into one canonical route template plus runtime variants. It will reject malformed/bracket-conflicting segments, legacy `*.route.ts`, default route exports, and supplied `method`/`path` with source-located migration diagnostics.

The route descriptor keeps its explicit ID and target. The compiler supplies method/path before normalization so existing graph, registration-plan, OpenAPI, client, diff, and inspector seams continue to consume HTTP trigger data. Optional catch-all produces two materialized registrations but one logical route/client identity. Registration ordering remains static, dynamic, required catch-all, optional catch-all, then stable ID.

**Alternative considered:** call Bun's file-system router directly. Rejected because its pages-style API does not model nested `route.ts` method exports and would couple deterministic compilation to runtime discovery.

### 2. Inference produces the existing serializable HTTP DSL

`defineRoute` will allow absent `request`/`responses`; it will not infer them at descriptor construction because file path and source export are compiler inputs. After route metadata is attached, normalization will inspect the target's deterministic JSON Schema projection:

- Dynamic segment fields become path mappings.
- Remaining GET/HEAD/DELETE/OPTIONS object properties become query mappings.
- Remaining POST/PUT/PATCH properties become one JSON object-body mapping.
- Catch-all fields use a new serializable `path-segments` source.
- Non-object/unavailable projections, unmatched segments, or unsupported ambiguity require a complete explicit mapping.

Response inference emits JSON `200` for non-void output, `204` for void/undefined, declared HTTP errors, and validation `422`; `successStatus` changes only the successful status. Explicit `responses` remains authoritative. The normalized graph always stores concrete mappings/responses, so runtimes and generators do not re-run inference.

**Alternative considered:** infer from TypeScript handler types. Rejected because types are erased and would diverge from the schemas used by runtime validation and OpenAPI.

### 3. Uploads use Web primitives and existing bounded parsing

`z.file` will validate `File` and project `string/binary`; no RELKIT upload wrapper is introduced. `multipartAll` will use ordered `FormData.getAll`. The existing request body limit will become the configured server default with a route override, and will run before parsing. File-specific limits run during target-schema validation. Buffering remains explicit documentation; streaming is deferred.

### 4. Rate limiting is a route policy backed by cache

The public policy is a serializable graph value containing `limit`, `windowMs`, a supported scalar request source, and an optional cache reference. The Hono runtime will adapt `hono-rate-limiter` behind an internal store bridge. Development may construct one generation-local memory store; production validation requires a cache reference and the runtime resolves it from registered providers. Rate limiting executes before authored middleware/body parsing, emits standard headers and inferred `429`, and records only low-cardinality policy/outcome metadata—never the raw key.

Keeping the external package behind one adapter and contract suite prevents its types or release cadence from becoming public API.

**Alternative considered:** implement a new counter/middleware package. Rejected because the dependency already provides the HTTP algorithm/header behavior and RELKIT only needs the storage/graph boundary.

### 5. Event callbacks are authoring sugar over generated functions

`@relkit/events` will declare an augmentable `EventRegistry` and type `onEvent` against its string keys. Compiler discovery first collects event descriptors, writes a deterministic declaration into `.relkit/generated`, then performs normal evaluation/normalization. Runtime validation still checks the named event against the actual descriptor set, preventing stale declarations from activating.

`onEvent(name, handler, options?)` returns an event-trigger descriptor carrying the callback only in the controlled evaluation/runtime manifest. Normalization generates a function descriptor/node using the listener's explicit ID or `<event-id>:<export-name>`, then points the generic trigger at it. The graph contains no closure. The generated handler adapts envelope input to `(payload, ctx)` and exposes envelope metadata through `ctx.event`; declared dependencies reuse the function context client builder. Durable delivery is the default and existing retry/provider machinery is unchanged.

`anyOf` and `match` continue compile-time expansion using string registry keys; restricted `all` remains the explicit unknown-payload escape hatch.

**Alternative considered:** register callbacks directly with event providers. Rejected because it would bypass common admission, tracing, concurrency, timeout, cancellation, dependency, and error semantics.

### 6. Configuration exposes only user decisions

Add `defineConfig` at `@relkit/app/config` and reduce accepted keys to nested `server` and `inspector` values. Internally, config loading still produces the compiler/supervisor options expected today, but fixed constants provide `src/app.ts`, `src/**/*.ts`, standard exclusions, `.relkit/generated`, and `.relkit/build`. Legacy path keys are rejected rather than ignored.

Port resolution is centralized and reused by dev/start/doctor/build-server: CLI flag, environment, config, default. `PORT` is reserved and removed from templates' application env descriptors. API docs default on in development and off in production; production enabling is rejected unless existing internal-endpoint protection is active.

### 7. Scalar uses the generated document, not live inspection

The runtime will register `/_relkit/v1/openapi.json` and `/_relkit/v1/api-reference` beside existing internal endpoints. `@scalar/hono-api-reference` receives the active generated OpenAPI content. Protected production pages embed the document so browser rendering does not require forwarding credentials to a second fetch; raw JSON remains protected. Scalar is the only bundled UI.

### 8. Effect CLI owns parsing/help while handlers stay intact

The existing Effect version's `effect/unstable/cli` command tree will define arguments, options, nested subcommands, help, examples, and shell completions. Thin adapters invoke current command handlers and preserve their result/exit/reporting contracts. The same tree will project a JSON-safe help model for docs. Existing logging remains; richer status rendering is gated by TTY and disabled in JSON/CI/non-interactive output.

**Alternative considered:** patch only `--help` in the manual parser. Rejected because nested parsing/defaults/docs would continue to have multiple sources of truth, while the needed CLI module is already installed.

### 9. Documentation is a Next workspace app with generated references

Add `apps/docs` using Fumadocs because the workspace already owns Next/React and Fumadocs supplies the required layout/search/content pipeline. Existing `docs/` material becomes guide source rather than duplicated prose. Published `@effect/docgen` at the matching Effect version will generate Markdown for application-facing packages from rich JSDoc; conceptual guides remain authored. A focused doc quality script checks required metadata and executes examples. CLI reference pages come from the Effect command model. Search plus `/llms.txt` and `/llms-full.txt` derive from the same content manifest.

Generated reference files are content-aware outputs and are never hand-edited. Docs build/link/search/doctest tasks live in `apps/docs`; root commands only delegate through Turbo.

**Alternative considered:** Blume/Astro. Rejected because it adds a second frontend/runtime toolchain without a requirement the existing Next stack cannot meet.

### 10. One canonical example replaces the fixture

Move the former commerce acceptance fixture into `examples/commerce`, register `examples/*`, and update all direct fixture paths. Expand this existing application rather than creating another full example. Its package owns check/type/test/build tasks and a feature-index README; generator templates remain the three small quick starts. Docs reference executable example source where practical.

### 11. Packaged development resolves a shipped inspector

The CLI package will include a production-built inspector asset/package location in its published files. Resolution order is shipped inspector, then explicit contributor override; installed projects no longer inspect monorepo-relative paths. The existing supervisor continues to own last-known-good switching and shutdown. A tarball smoke test is the authority for packaging, ports, API docs, process cleanup, and external-workspace resolution.

### 12. Inspector redesign reuses models and APIs

Tailwind v4 and shadcn's React Aria base will supply tokens and only the components used by the shell, forms, tables, sheets, dialogs, and feedback. A small shared resource-list/view layer will consume existing server-filtered/cursor APIs and retain linkable detail routes.

`@xyflow/react` replaces only the visual graph canvas; existing graph projection and deterministic positions remain, avoiding another layout dependency. A semantic node/edge table remains the accessibility fallback. The trace view will render the current redacted trace model as a tree/waterfall with CSS positioning and existing query links; no OpenTelemetry or Jaeger UI package/store is added. The API Reference destination embeds or links to the active Scalar endpoint.

The implementation will first read the installed Next 16 guidance required by `apps/inspector/AGENTS.md` and will finish with React Doctor plus focused Playwright accessibility/visual checks.

## Risks / Trade-offs

- **Generated event types appear only after first create/check/dev** → templates run checking during creation, generated declarations are included in TypeScript config, writes are atomic, and runtime compilation always revalidates names.
- **Schema projection cannot express every transport shape** → fail with a precise diagnostic and retain complete explicit request/response mappings; never guess.
- **Optional catch-all creates two runtime/OpenAPI paths** → keep one canonical route ID and deterministic variant IDs internal to registration/OpenAPI generation.
- **In-memory rate limits mislead production users** → label them development-only and reject production activation without a shared cache.
- **Large coordinated break makes intermediate states fail** → implement in dependency order, update templates/example alongside each public contract, and check OpenSpec tasks only after focused tests pass.
- **Documentation generators or UI dependencies add build weight** → isolate dependencies in their owning package, pin versions, install only used components, and preserve package-local Turbo tasks/outputs.
- **Inspector visual work can regress accessibility/redaction** → retain semantic fallbacks, use versioned redacted APIs only, and gate representative keyboard/mobile/theme flows.
- **Moving the fixture breaks hard-coded paths** → search the full repository, update one canonical path, and retain a packed/external smoke test rather than a symlink or duplicate compatibility directory.

## Migration Plan

1. Land compiler/public route and event contracts together with source diagnostics and regenerated templates.
2. Update the commerce application to the new APIs and move it to `examples/commerce`; update all test/script/config paths in the same task.
3. Switch config and CLI parsing, then validate generated and packed projects outside the workspace.
4. Add runtime rate-limit/API-reference behavior and deployment production validation.
5. Add docs and inspector changes after their backing contracts are stable.
6. Publish a breaking changelog and migration guide covering route files, inferred mappings, callback listeners, config keys/ports, and generated artifacts.

Rollback during development is a source rollback plus regeneration; no persistent application data migration is introduced. Released users must remain on the prior pre-1.0 version or apply the documented source migration because compatibility shims are intentionally absent.

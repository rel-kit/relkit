# Changelog

## Unreleased

## 0.7.15

### Changes

- Add `relkit add inspector`, which enables `inspector.enabled`, installs `@relkit/inspector` as a project devDependency and adds an `inspector` script, and `relkit inspector [--port] [--hostname]`, which runs that project-local UI, so inspection no longer needs a global install. New applications select the Scalar API reference (`server.apiDocs.ui: "scalar"`), so `relkit dev` advertises it, and the create summary's backend link now points at a served endpoint instead of the unrouted root.

## 0.7.14

### Changes

- `relkit dev` now applies `inspector.enabled` and `inspector.connection` changes on reload. Enabling inspection starts the session bridge, telemetry capture and discovery descriptor once the rebuilt generation is serving, so an already-running standalone Inspector connects without restarting `relkit dev`; disabling it stops the bridge and closes the telemetry ingress once the previous generation has drained, and a connection change rebinds the bridge. Re-enabling keeps recording history under the same session, and a bridge that failed to start is retried on the next reload.
- Refresh bundled dependency versions.

## 0.7.13

### Changes

- chore(deps): bump the npm_and_yarn group across 5 directories with 3 updates

## 0.7.12

### Changes

- Bootstrap release tooling in clean installations and validate versioning and packaging before merging. Normalize dependency security updates through their owning catalog and lockfile, with automatic Changesets prepared by trusted repository automation.
- Fix/lean installation and standalone inspector
- Keep ordinary backend, generic client and testing installations free of unselected native SDKs. Selected integrations declare optional peers and validate their actual installed versions before configuration evaluation, startup or deployment. Move native agent APIs and test helpers to `@relkit/langchain`, local diagnostic storage to `@relkit/observability-local`, and native auth/database testing to explicit testing leaves. Frontend clients and optional HTTP transports remain explicit selections. Runtime lifecycle belongs to the engine; production starts emitted JavaScript with an exact selected dependency manifest. The legacy CLI inspector remains a Stage 1 development dependency. The lightweight creator owns new project creation; existing project editing belongs to the CLI. The wrapper resolves compatible project-local tooling, and the catalog contains metadata only. Selected auth scaffolds preserve Better Auth 1.7.1 schema history and the existing Drizzle patch while carrying the official fetch typing fix. These packages retain independent versions. Existing package minor releases carry the intentional import and dependency-policy changes; the new native packages have their own initial release identities. No publication or version command is included.
- Disable development inspection by default and move the UI, collector and diagnostic history into the separately installed `@relkit/inspector` tool. Enabled applications publish a private authenticated bridge that survives reloads; the CLI no longer installs or starts Next.js, React, DuckDB or a history worker. Production excludes rich inspection even when development inspection is enabled. Preserve project history with transactional replay receipts, bounded redacted capture and explicit incomplete states. Ship an independent non-root Docker build with directory credentials and persistent project-bound history. The tool keeps its own release identity; image and package publication require separate authorization.

## 0.7.11

### Changes

- Fix Inspector cold startup, failed reload visibility, and decoded runtime environment values.

## 0.7.10

### Changes

- Validate installed RELKIT packages against their own declared versions so doctor accepts independently versioned releases and still reports missing or incompatible installations. Use each optional scaffold dependency's own version rather than the generator version, and refresh the generator when any bundled scaffold dependency changes.
- Resolve generated provider dependencies using each package's own release version.

## 0.7.9

### Changes

- Guide cohesive domain services and add agent evaluations

## 0.7.8

### Changes

- feat: centralize database migrations and refine application guidance

## 0.7.7

### Changes

- Handle SIGHUP through invocation cancellation so prepared development joins its backend, inspector, and storage workers before exiting with status 129. Terminal hangup now retains shutdown diagnostics instead of leaving orphaned children.
- Require complete packed creation functionality for release admission and report shared-host startup performance separately without discarding slow samples.
- Generate a native Bun SQLite migration runner so database and auth apps can apply Drizzle migrations without selecting a Node-only driver. Include generated context declarations in every starter's TypeScript program so database and auth context types are available to application functions.
- Refresh development candidate environments after dotenv edits and observe dotenv repairs in prepared sessions. Preserve the last valid server during failed reloads and remove deleted file-managed values from subsequent candidates. Forward resolved application environment values to HTTP function invocations. Keep manual source-watcher admission synchronous while retaining lazy watcher loading for CLI sessions.
- Require proven function descriptor provenance for eager `asTool` construction during prepared startup. Isolate dotenv helper execution from application preload configuration and inherited runtime options while preserving those options for application candidates.
- Accept the generated context declaration and parameter route folders during development snapshot preparation, integrity verification, and input watching while retaining containment and generated-root checks.
- Support declarative SQLite/Drizzle and Better Auth applications in prepared development startup. Audit SQLite metadata callbacks and literal descriptor options, defer native database client lifecycle work until activation, and reject ambient values, eager clients and imports outside the audited backend sources. Tooling stays fingerprinted without being evaluated during eligibility checking. Generated SQLite services store mutable data under `.relkit/state` and create missing parent directories only during migration or runtime client acquisition. Validate and narrow database paths before filesystem setup so generated services also compile with the generic environment context.

## 0.7.6

### Changes

- feat(generator): bundle RELKIT application skills in every starter
- feat: adopt grouped service layout and guarded migrations

## 0.7.5

### Changes

- fix: document auth endpoints and reuse initial dev validation

## 0.7.4

### Changes

- fix: restore certified creation and prepared bundles

## 0.7.3

### Changes

- feat: serve prepared generated apps in under 500 ms

## 0.7.2

### Changes

- Publish the unscoped relkit package so bunx relkit runs the existing RELKIT CLI.

## 0.7.1

### Changes

- Update shared Next.js and Hono dependencies to patched versions and retain the Next.js template security fix through release synchronization.
- chore(deps): bump next from 16.3.6 to 16.3.8 in /templates/default/v1/fullstack
- chore(deps): bump the bun-dependencies group across 1 directory with 24 updates

## 0.7.0

### Changes

- Expose generator services built with Effect and resolve portable dependency catalogs and declaration patches. Preserve existing Promise APIs, move command execution to dedicated bins, and give CLI operations explicit cancellation and cleanup ownership.

## 0.6.0

### Changes

- Add Effect-native database ownership and authentication services while preserving existing Promise APIs. Keep transaction descendants and native auth initialization within database admission, validate native numeric schema ranges, and expose redacted specialized operation telemetry.

## 0.5.6

### Changes

- Refactor core consumer workflows into scoped Effect services

## 0.5.5

### Changes

- Refactor execution services with Effect and fix runtime regressions

## 0.5.4

### Changes

- Allow development and production builds without the optional DeepAgents peer installed. Keep installed DeepAgents dependencies bundled for standalone production containers.

## 0.5.3

### Changes

- chore(deps): bump next from 16.3.3 to 16.3.6 in /packages/cli
- Refactor compilation and generated contracts and enforce route authoring
- Refactor RELKIT authoring packages and refresh API docs

## 0.5.2

### Changes

- Refactor RELKIT foundations and stabilize fast CI

## 0.5.1

### Changes

- docs: guide developers through a verified Orders API

## 0.5.0

### Changes

- test(runtime-hono): make temp state cleanup idempotent
- Adopt task-first durable jobs with explicit task identity, job admission, generated clients, and provider-specific capability diagnostics. Legacy function-target jobs and enqueue helpers remain behind the one-release compatibility window; migrate with the jobs migration guide before the next major release.

## 0.4.1

### Changes

- fix(scaffold): follow release package version
- Add generic streaming, realtime channels and presence, typed React clients, durable agent lifecycle support, shared Redis providers, and full-stack examples and documentation.
- feat(cli): add interactive scaffolding and comprehensive artifact guides

## 0.4.0

### Changes

- Add request-centric runtime instrumentation, canonical model v2 execution records, live Inspector span details, strict W3C propagation, and OTLP/HTTP JSON trace and log export.

## 0.3.0

### Changes

- Make development terminal logs readable and persist local telemetry in a CLI-owned DuckDB store. Add searchable inspector logs with stable live updates and request lifecycle traces that keep correlated details beside the list.

## 0.2.0

### Changes

- Replace the pre-1.0 provider ownership contract and legacy provider package exports with `defineApp` bindings, explicit test replacements, and independently installable integration packages. This breaking cohort intentionally ships without compatibility aliases, old artifact readers, or migration tooling.

## 0.1.0

### Changes

- Replace `onEvent` and selectors with authored `defineEventFunction` consumers. Events declare `input`, and functions declare exact publication permissions with `publishes`. Event-only functions accept delivery and replay through the common runtime and cannot be invoked through HTTP, jobs, tools, services, or direct calls. This pre-1.0 breaking release updates compiler and manifest contracts, local and AWS delivery, deployment permissions, Inspector views, test helpers, examples, and generated templates together. Existing applications must migrate their event authoring and regenerate their artifacts; no compatibility aliases or persisted-state migration are provided. API documentation can also exclude selected domains.

## 0.0.5

### Changes

- Redesign services around domain-first applications

## 0.0.4

### Changes

- chore(deps): bump the bun-dependencies group with 2 updates

## 0.0.3

### Changes

- chore(deps): bump the bun-dependencies group with 6 updates

## 0.0.2

### Changes

- chore(deps): bump the bun-dependencies group across 1 directory with 27 updates

## 0.0.1 — Breaking

This pre-1.0 release intentionally breaks the previous authoring conventions:

- HTTP routes now use named method exports from `src/routes/**/route.ts`; method and path are derived from the file system, and routine request/response contracts are inferred.
- Event listeners now use typed `onEvent(name, handler, options?)` callbacks backed by the generated event registry.
- Configuration now uses `defineConfig` from `@relkit/app/config`, fixed source/generated paths, and `server`/`inspector` port settings.
- The CLI now has nested Effect CLI help and completions, and development ships the inspector plus OpenAPI and Scalar.
- `examples/commerce` is the canonical executable example; the searchable Fumadocs application and redesigned inspector cover the public framework surface.

There is no compatibility layer or codemod. Follow the [breaking-change migration guide](apps/docs/content/docs/operations/migration.mdx) and preserve explicit descriptor IDs while moving files.

### Changes

- Publish the first supported RELKIT release with protected CI, typed application subpaths, self-contained project templates, and trusted npm publishing.

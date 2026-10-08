# Changelog

## Unreleased

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

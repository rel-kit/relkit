# Changelog

## Unreleased

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

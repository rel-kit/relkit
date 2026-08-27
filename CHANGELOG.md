# Changelog

## Unreleased — Breaking

This pre-1.0 release intentionally breaks the previous authoring conventions:

- HTTP routes now use named method exports from `src/routes/**/route.ts`; method and path are derived from the file system, and routine request/response contracts are inferred.
- Event listeners now use typed `onEvent(name, handler, options?)` callbacks backed by the generated event registry.
- Configuration now uses `defineConfig` from `@relkit/app/config`, fixed source/generated paths, and `server`/`inspector` port settings.
- The CLI now has nested Effect CLI help and completions, and development ships the inspector plus OpenAPI and Scalar.
- `examples/commerce` is the canonical executable example; the searchable Fumadocs application and redesigned inspector cover the public framework surface.

There is no compatibility layer or codemod. Follow the [breaking-change migration guide](apps/docs/content/docs/operations/migration.mdx) and preserve explicit descriptor IDs while moving files.

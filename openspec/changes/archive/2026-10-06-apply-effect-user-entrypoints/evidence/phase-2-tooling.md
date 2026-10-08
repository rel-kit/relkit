# Phase-two catalog and publication tooling evidence

Owner: `/root/plan_cli`. Worktree:
`/Users/mustafaelsayed/.codex/worktrees/effect-user-entrypoints/relkit`.
No task status or Git staging is changed by this evidence.

## Delivered foundation

The generator owns one pure strict default/named catalog resolution core. Project
discovery and typed scaffold-error translation remain in its adapter; release
tooling imports the same core directly. Catalog entries reject missing,
recursive, scheme-protocol, and filesystem-path values. Release checks resolve
all dependency fields while preserving intentional peer ranges.

Release sync derives portable `relkit.buildCatalog` metadata, Drizzle patch
registration/version/hash, concrete standalone template pins, and native Effect
and SDK literal constants from the root catalog. Freshness checks cover those
outputs, including changes to patch bytes. Root build checks freshness before
Turbo. Generator packaging validates metadata before copying the canonical
patch asset into its published `dist/patches` directory.

Release staging writes catalogs, named catalogs, overrides, patch registrations,
and relative patch bytes before lockfile installation. Packing checks all
concrete dependency and peer fields, package metadata, and required assets.
The smoke registry serves actual verified tarball manifests. Existing template,
export, development-file, and release-note guards remain enforced.

The focused CLI foundation changes use resolved own-package metadata for stale
external link fallback and TypeScript defaults. Doctor resolves project-owned
catalogs and reports resolution failures rather than comparing alias strings.

## Verification

- `bun test tests/unit/catalog-manifest.test.ts tests/unit/build-catalog.test.ts
  tests/unit/packed-registry.test.ts tests/unit/sync-release.test.ts
  tests/unit/release-check.test.ts packages/cli/doctor.test.ts`: **11 passed,
  0 failed, 63 assertions**.
- Strict no-emit TypeScript check of all new catalog/staging/packed-consumer
  helpers and their release/smoke callers: passed with repository compiler
  settings and `skipLibCheck` retained for tooling dependencies.
- `bun scripts/sync-release.ts`: freshness passed.
- Prettier check of all 25 lane TypeScript files: passed.
- `bun scripts/pack-and-smoke-postgres.ts`: passed twice, including the reviewer
  requested positive `Effect.Effect<number, SqlError>` assignment on the final
  run. The command stages and packs the actual release artifacts, extracts and
  verifies the generator's archived patch, installs through the tarball registry
  with an isolated cache, and compiles the standalone consumer with
  `skipLibCheck: false`. Positive and negative probes retain SQL failure types,
  PgClient acquisition authority, LISTEN scope, and the native Effect literal.

## Reviewed change inventory

The independent reviewer receives these **25 TypeScript files**:

- `scripts/build.ts`
- `scripts/build-catalog.ts`
- `scripts/build-catalog.types.ts`
- `scripts/catalog-manifest.ts`
- `scripts/catalog-manifest.types.ts`
- `scripts/release-stage.ts`
- `scripts/release-check-artifacts.ts`
- `scripts/release-check-listing.ts`
- `scripts/release-check-templates.ts`
- `scripts/release-check-support.ts`
- `scripts/release-check.ts`
- `scripts/sync-release.ts`
- `scripts/package-create-relkit-templates.ts`
- `scripts/pack-and-smoke-create-relkit-pack.ts`
- `scripts/packed-postgres-consumer.ts`
- `scripts/pack-and-smoke-postgres.ts`
- `tests/unit/catalog-manifest.test.ts`
- `tests/unit/build-catalog.test.ts`
- `tests/unit/packed-registry.test.ts`
- `tests/unit/sync-release.test.ts`
- `packages/cli/src/local.ts`
- `packages/cli/src/commands/doctor-compat.ts`
- `packages/create-relkit/src/catalog-resolution.ts`
- `packages/create-relkit/src/catalog-resolution.types.ts`
- generated `integrations/packages/effect-mq/src/build-catalog.ts`

## Review responses

The release artifact helper was split into listing and template leaves, new
public helpers gained TSDoc, and reusable metadata types moved into `.types.ts`
companions. The clean packed transaction probe gained an exact positive SQL
failure assignment so widening its failure channel to `unknown` cannot pass.
All implementation files remain below the repository's 250-line limit. Final
independent acceptance is recorded by `/root/native_gate` separately.

# Phase 2 native compatibility and independent review

Reviewer: `/root/native_gate`, 2026-10-05.

## Native verification

- `rtk bun tests/jobs/compatibility/effect-mq-native.ts` passed against the pinned
  PostgreSQL Docker fixture: durable acceptance/deduplication, worker restart,
  retry history, active cancellation, and recurring scheduling. The fixture
  cleaned up its container and volume. Log: `/tmp/relkit-effect-v4-native-postgres.log`.
- `rtk bunx vitest run integrations/packages/effect-mq/tests/postgres-declarations.test.ts integrations/packages/effect-mq/tests/postgres-listen.test.ts --maxWorkers=1`
  passed **8/8** after the final patch was installed and the cold build settled.
  No timeout or compiler guard was weakened. Log: `/tmp/relkit-effect-v4-postgres-gate.log`.
- The compiler harness uses `strict: true`, `skipLibCheck: false`,
  `exactOptionalPropertyTypes: true`, and `noUncheckedIndexedAccess: true`.
  It checks native Drizzle transactions, query errors, PostgreSQL LISTEN errors,
  and missing PgClient/Scope authority. Mutation probes reject both `any` and
  removal of `SqlError` from the transaction error channel.
- The pre-existing `createEffectMqPostgresLayer` annotation
  `Layer<any, any, any>` is outside this compatibility change and is excluded
  from the claimed declaration guarantee.
- The reviewer authored the two new declaration-test files; those files are
  explicitly excluded from this independent review and require another reviewer.

## Root-authored TypeScript coverage

All 18 files below were read through EOF and their changes reviewed:

- `packages/cli/src/cli-command.ts`
- `packages/cli/src/cli-command-add.ts`
- `packages/cli/src/cli-command-basic.ts`
- `packages/cli/src/cli-command-client.ts`
- `packages/cli/src/cli-command-deploy.ts`
- `packages/cli/src/cli-command-groups.ts`
- `packages/cli/src/cli-command-jobs.ts`
- `packages/cli/src/cli-command-jobs-runs.ts`
- `packages/cli/src/cli-command-local.ts`
- `packages/cli/src/cli-command-shared.ts`
- `packages/cli/src/cli-effect-runtime.ts`
- `integrations/packages/effect-mq/src/postgres-listen.ts`
- `integrations/packages/effect-mq/src/deployment/index.ts`
- `integrations/packages/effect-mq/tests/postgres-listen.test.ts`
- `packages/observability/src/local/duckdb-worker-process.ts`
- `packages/observability/src/local/duckdb-worker.ts`
- `packages/contracts/src/operation.types.ts`
- `packages/contracts/tests/operation-observer.test.ts`

Stable import replacements preserve existing behavior. The DuckDB process
entrypoint passes its actual `Scope.Closeable` owner and supplies the same scope
for acquisition, retaining its existing disconnect/startup cleanup contract.
The new execution domains retain declaration-owned labels and registry isolation.
No actionable findings remain in these 18 files. This compatibility review does
not claim the later full package service refactors are complete.

Installed Effect 4.0.1 source was checked for `Effect.Error`, CLI exports,
`Scope.Closeable`/`Scope.provide`, SQL errors, and PgClient LISTEN lifetime/error
behavior. Vendor PostgreSQL integration tests, migrator examples, CLI command
tests/type probes, and benchmark usage were inspected. The partial vendor checkout
lacks PgClient implementation, so installed stable source supplies that evidence.

## Canonical Drizzle patch review

The final asset changes **54 declaration files only**: 46 stable SQL import
replacements and 30 explicit optional-field `undefined` unions across eight
PostgreSQL/Cockroach config declarations. It changes no runtime code and no
constructor lines.

The first optional-field patch accidentally changed constructor declarations.
Strict compilation exposed TS1144 errors; the author corrected the patch to
interface members, forced reinstallation, and the final strict gate passed.
This finding is resolved.

## Tooling independent review

All 25 final tooling-lane TypeScript files were read through EOF and reviewed:

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
- `integrations/packages/effect-mq/src/build-catalog.ts` (generated)

Catalog resolution, packed dependency equivalence, release staging, metadata
materialization, registry metadata, and fresh registry consumer ownership were
inspected. The pure resolver rejects missing catalog authority and recursive or
portable-install-incompatible entries. Resource cleanup remains explicit in the
bounded release harnesses; no new domain service or cache lifetime is introduced
by these foundation helpers. Focused verification was rerun on the final files:
`rtk bun test tests/unit/catalog-manifest.test.ts tests/unit/build-catalog.test.ts tests/unit/packed-registry.test.ts tests/unit/sync-release.test.ts`
passed **7/7**. Log: `/tmp/relkit-effect-v4-catalog-review.log`.

Three findings are resolved: the 311-line artifact helper was split below the
250-line implementation cap; reusable catalog helpers now have required TSDoc
and type companions; and the packed compiler consumer adds a positive exact
`Effect.Effect<number, SqlError>` assignment so `unknown` cannot masquerade as
the expected transaction error channel. The fresh consumer extracts and hashes
the generator's packed patch, installs from registry tarballs with an isolated
cache, and uses `skipLibCheck: false`. Its registry and fixture have explicit
cleanup owners. The author reports the final stricter registry gate passed;
its exact command and verification are recorded in `phase-2-tooling.md`.

No actionable findings remain across the 18 root-authored and 25 tooling-lane
TypeScript files reviewed here. This is foundation-phase acceptance, not a claim
that subsequent package service refactors or end-to-end acceptance are complete.

# Drizzle compatibility gate

Status: **blocked**. No patch-free tuple has passed the required gate. Root pins,
patch ownership, catalogs, generated projects, and sample history remain intact.

## Patch audit and ownership

The patch contains 54 hunks, one per declaration file:

- 46 hunks replace `effect/unstable/sql/SqlError` with `effect/sql/SqlError`.
  These cover SQLite/PG/MySQL Effect core and libsql, wasm, PGlite, Durable
  Objects, Postgres, D1, mysql2, Node SQLite, and Bun SQLite declarations, in
  ESM and CommonJS forms.
- Eight hunks repair strict optional-property incompatibilities in PgPolicy,
  PgRole, CockroachPolicy, and CockroachRole, in both declaration formats.

The complete per-hunk path/class/hash inventory is in
[baseline-inventory.json](baseline-inventory.json). The independent registry
[patch-target audit](compatibility/patch-target-audit.json) verifies downloaded
tarball SHA-512 integrity, records SHA-256 archive/file hashes, and inspects
every patched path. Both RC5 packages still contain all 46 obsolete SQL imports.

Ownership traced from current source:

| Stage                          | Owner and behavior                                                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Authoritative pin/registration | Root package.json catalog and patchedDependencies; bun.lock registration                                                              |
| Catalog producer               | scripts/build-catalog.ts constructs registration, reads patch bytes, hashes asset; build-catalog.types.ts includes patches            |
| Release synchronization        | scripts/sync-release.ts regenerates root registration and CLI/generator/native integration metadata                                   |
| Consumer descriptor            | packages/create-relkit/src/build-catalog.ts validates version/key/asset/hash                                                          |
| Creation                       | generate-preparation.ts calls prepareProjectDependencyPatchEffect in dependency-patches.ts                                            |
| Add planning                   | plan-builder-manifest.ts reads/hash-checks repair and plans its asset/manifest operations                                             |
| Transaction                    | dependency-patch-installation.ts detects patch-only changes; add-transaction-workflow.ts includes install/check in rollback ownership |
| Bundled asset                  | scripts/package-create-relkit-templates.ts copies patch into generator dist/patches; generator package files include dist             |
| Release staging/listing        | release-stage.ts copies registered assets; release-check-listing.ts requires each catalog asset                                       |
| Packed strict proof            | scripts/packed-postgres-consumer.ts currently extracts/registers the bundled patch                                                    |
| Tests/docs                     | dependency-patches/generation, project-catalog, build-catalog, sync-release, listing tests; docs jobs/providers/effect-mq guidance    |

Deleting the patch before changing these producers would break packaging or
cause regeneration to restore its registration. Transactional behavior and
unrelated patch entries must survive a future proven removal.

## Independent fixture results

The successful corrected probe run is
[`20261018T134333Z/results.json`](compatibility/runs/20261018T134333Z/results.json).
It records exact manifests, all installed direct dependency versions and registry
integrities, commands, child PIDs, exits, raw logs, history hashes, and database
state. Bun is 1.3.10; TypeScript 5.9.3; Effect and @effect/sql-pg 4.0.1;
@types/bun 1.3.10. Candidate fixtures contain no patch registration, baseline
node_modules, baseline lockfile, repository link, or modified dependency bytes.

| ORM / Kit                                               | Install + frozen reinstall | Targeted strict declaration checks                                     | Unchanged baseline history                                       | Result                                                 |
| ------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------ |
| 1.0.0-rc.5-169397b / 1.0.0-rc.5-ab785fc, existing patch | Pass                       | Seven checked files pass                                               | Generated, applied, seeded, no-op passes                         | Control only; not patch-free acceptance                |
| Same tuple, unpatched                                   | Pass                       | Four class failures and three unresolved SQL-import failures           | No-op preserves exact schema/row/log                             | Rejected                                               |
| 1.0.0-rc.5-5935859 / 1.0.0-rc.5-5935859                 | Pass                       | Same seven failures                                                    | No-op, subsequent migration, fresh database and later no-op pass | Rejected by declaration gate                           |
| 0.45.4 / 0.31.11                                        | Pass                       | PG policy/role failures; required Cockroach/Effect declarations absent | Fails: cannot find meta/_journal.json                            | Rejected by types, API availability and history format |

The declaration probe uses strict, exactOptionalPropertyTypes,
noUncheckedIndexedAccess and skipLibCheck=false for every fixture. It checks
the four repaired class declarations and the three affected Effect Postgres
declarations directly through the same TypeScript compiler API. This is a
bounded negative gate, not a passing whole-package typecheck or full runtime
acceptance. Missing stable declarations and mismatched history are failures,
not permission to drop coverage or convert history.

For the newer RC, original SQL/snapshot hashes and the first applied-log row
remain byte/value identical after adding a nullable column. The original
business row persists. The fresh database has the same final schema and
migration identities/hashes; applied_at timestamps legitimately differ between
databases. Repeat runs preserve the previously migrated database's entire log
and data. The fresh database was applied once.

The initial exploratory attempt is preserved separately. It exposed a probe
library-set issue and a mistaken comparison of fresh execution timestamps;
those are harness issues, not dependency failures. The corrected run uses the
existing strict packed probe's default library set and compares cross-database
log identities while still requiring exact same-database no-op invariance.

## Supported adjustment assessment and remaining work

No supported integration adjustment has been demonstrated that passes this
gate. Replacing an Effect adapter alone would leave the invalid PG/Cockroach
class declarations. RELKIT's native Drizzle metadata/types currently import
pg-core, and the stable tuple removes required Effect surfaces and expects a
different history format. Suppression, hidden rewriting, history conversion,
Effect downgrade, or removing supported APIs would violate this design.
Task 2.2 remains open; this is not a claim that every conceivable integration
adjustment has been exhausted.

Tasks 2.1–2.5 and final acceptance remain open. Database/auth HTTP acceptance,
PostgreSQL/MySQL infrastructure, RELKIT packed consumers, whole-package checks,
model evaluations, and certification were not run: rejected candidates cannot
establish those requirements. Independent guidance work is allowed by the
design but has not been implemented during this gate investigation.

Reproduce on a Mac with normal memory pressure:

```sh
rtk python3 openspec/changes/refine-application-skills-and-generated-projects/evidence/compatibility/run.py
```

Registry metadata and tarballs are fetched from
[the npm registry](https://registry.npmjs.org/drizzle-orm). Versions reflect
the live lookup on 2026-10-18; the record makes no assumption that a newer
publish will retain the same defects.

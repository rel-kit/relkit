# Serial acceptance continuation

Date: 2026-10-18. The user requested further acceptance with the current Drizzle
patch retained and one resource-intensive operation at a time. No product source,
dependency pin, repair, release identity, admission rule or historical evidence
was changed during this continuation. Progress remains **18/31 complete**;
the remaining task definitions require more than the checks completed here.

## Passed checks

All commands and before/after resource observations are recorded in
[acceptance](acceptance/). Runs were sequential, at nice priority 10. TypeScript
heaps were capped at 512 MiB. The fresh consumer installer used Bun's small-memory
mode, a private cache and network concurrency one.

| Evidence file prefix     | Check                                                                                 | Result                                                                                                                                                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth-sample`            | Actual SQLite/auth sample integration test                                            | 1 test / 16 assertions: signup, session cookie, session lookup, signout, bad-password denial, signin and denied/allowed protected resource requests. This uses the real test application HTTP adapter, not a production network server. |
| `data-model-typecheck`   | Strict TypeScript sample check with `--noEmit`                                        | Passed under 512 MiB heap cap.                                                                                                                                                                                                          |
| `auth-drizzle-typecheck` | Strict TypeScript sample check with `--noEmit`                                        | Passed under 512 MiB heap cap.                                                                                                                                                                                                          |
| `docs-learning`          | Auth, database, Start, HTTP and service documentation tests                           | 16 tests / 332 assertions passed.                                                                                                                                                                                                       |
| `release-contract`       | Release identity/report-shape, package manifests/publication ordering and notes tests | 5 tests / 13 assertions passed. Existing report validation is not proof that its template digest matches current source; see audit below.                                                                                               |
| `docs-links`             | Authored/generated documentation links                                                | 158 pages checked.                                                                                                                                                                                                                      |
| `docs-search`            | Search corpus and metadata                                                            | 158 pages validated.                                                                                                                                                                                                                    |
| `docs-jsdoc`             | Rich public authoring JSDoc                                                           | 32 APIs checked.                                                                                                                                                                                                                        |
| `authoring-lint`         | Public authoring scan                                                                 | 92 source/example fragments passed.                                                                                                                                                                                                     |
| `pack`                   | Existing `packAll`, `checkManifests`, packed dependency and listing checks            | All 53 candidate archives passed. Uses already compiled outputs: affected CLI/generator were compiled in the preceding implementation run; no unrelated full build is implied.                                                          |
| `identity`               | Independent archive SHA-256 and packaged skill comparison                             | All 53 archive hashes match; 13 skill/reference files per template, 65 total across minimal/api/agent/fullstack/tasks, match current source bytes.                                                                                      |

The three test runs above contain 22 tests and 361 assertions. They overlap some
previous coverage; do not add them to previous run counts as unique tests.

## Resource and infrastructure blockers

The Mac has ten logical CPUs and 16 GiB RAM. Pressure oscillated between normal
and warning; heavy commands started only under normal pressure. The saved raw
`vm_stat` observations distinguish physical free pages from compressed memory.
Load rose from roughly 4 to above 8 during the outside-workspace install, with
warning pressure. The owned installer was verified by PID, parent, group,
registry port and command before its group received SIGTERM. It exited 143,
and the existing scaffold process owner joined exit/output cleanup.

[packed-results.json](acceptance/packed-results.json) preserves that real failed
attempt: dependency resolution had started, but installation had not finished.
Its candidate registry stopped and entire disposable consumer/cache directory
was removed in `finally`. No successful install, frozen reinstall, create
entrypoint, no-database check/dev, packed worker execution, production start,
database add or auth add is claimed from this attempt. The prepared finite
consumer script's later stages were **not executed**. Task 3.6 remains open.

The PostgreSQL 14.23 server/client/control tools are installed. A serial proof
was prepared to use an owned cluster with 8 MiB shared buffers, five connections,
autovacuum/parallel workers disabled, TCP loopback and explicit service history.
The resource gate deferred it before initialization, so **no PostgreSQL cluster
was started and no PostgreSQL behavior was verified**. `postgres.json` records
the pre-start blocker; its later script stages are unexecuted.

Docker CLI exists, but `docker info` failed because the Docker daemon is stopped.
No `mysql` or `mysqld` executable is installed. No Docker Desktop, container,
shared PostgreSQL service or other user service was started or stopped. Real
MySQL acceptance is blocked by missing local infrastructure. PostgreSQL/MySQL
remain open for task 3.3 and the multi-dialect portion of 6.3.

Full docs generation/typechecking/build, full candidate workflow and repeated
fresh/restart certification were not started under this unstable headroom. No
failed consumer workload was repeatedly relaunched after its resource stop.

## Exact certification gap

[identity-results.json](acceptance/identity-results.json) records:

- Current minimal template digest:
  `1ed32235af2ffe5f87210acffb3dabbe9e3c3bc2e40abbf912ad7517823e4b2c`.
- Existing certification digest:
  `0988a030a6d7c12f495ba7d097618941061e2d2c4946eb0799c0929f7587da6b`.

They differ. Historical release report-shape tests passing does not refresh this
identity. The existing certification driver still needs its complete new
identity and 20 fresh plus 20 restart measurements under sufficient resources.
No tuple was promoted, threshold weakened, digest patched by hand or historical
report relabeled. Task 6.4 stays open.

## Remaining task impact

- **2.1–2.5:** patch-free compatibility/removal remains blocked and intentionally
  untouched under the user's current instruction.
- **3.3:** real PostgreSQL/MySQL success/failure acceptance remains open.
- **3.6:** actual fresh installed migration worker and no-database check/dev
  remain open after the resource-stopped installation.
- **5.3:** protected users/orders route validation/authorization and concrete
  fullstack behavior still need complete acceptance. The sample test above is
  additional real auth adapter evidence, not this whole guidance scenario.
- **5.5:** final packaged skill byte parity now passes; exact evaluator model
  provenance and remaining behavioral scenarios are still missing.
- **6.1:** broader applicable gates remain open; new sample typechecks, authoring
  lint, docs checks and focused tests supplement the previous successful checks.
- **6.2:** both public create entrypoints and no-DB/database/auth flows need an
  independently completed candidate install, frozen install, check/typecheck/
  test/build/start and expected live HTTP assertions.
- **6.3:** full dialect histories/subsequent migration and production auth/session
  and protected-route flows remain open. Current SQLite adapter proof is useful
  partial evidence only.
- **6.4:** all packaged skill files now match source, but current certification/
  readiness evidence remains missing as shown above.

Final [cleanup record](acceptance/cleanup.json) verifies owned PIDs/listeners and
temporary directories are gone, and protected source/patch/history hashes remain
unchanged. Artifact archives were test-owned temporary output and were removed
after their hashes and listing results were recorded. No user database was
migrated, no cloud cost incurred, and no Git mutation was performed.

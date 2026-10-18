# Final verification

Completed on 2026-10-18 for `refine-application-skills-and-generated-projects`, based on revision `05a53404222d9c5de4ef0126d719066ca21b6f30`. All 31 revised tasks are complete. The user's final scope retains the Drizzle patch and its existing distribution; patch removal is excluded. Earlier checkpoint reports remain historical.

## Delivered behavior

`relkit db migrate [--config <path>]` now owns migration execution through a packaged, finite worker. SQLite uses the consumer's Bun-native ORM migrator; PostgreSQL/MySQL delegate to consumer-installed Kit. Configuration remains authoritative, history is checked before connection acquisition, errors produce controlled output, and invocation cleanup completes before successful publication. Generated database/auth projects use the shared command and service-owned migration history. Both repository sample histories moved without changing SQL or metadata bytes.

Application guidance now covers task intent, only missing onboarding decisions, intentional optional capabilities, resource-specific backend contracts, explicit frontend requests, and behavior-based completion. Real evaluation failures also produced two narrow clarifications about service exports and returning declared failures. All five maintained templates carry identical skill trees and ignore framework output while retaining migration source.

## Retained dependency identity

| Input                         | Final value                                                        |
| ----------------------------- | ------------------------------------------------------------------ |
| Drizzle ORM                   | `1.0.0-rc.5-169397b`                                               |
| Drizzle Kit                   | `1.0.0-rc.5-ab785fc`                                               |
| Effect                        | `4.0.1`                                                            |
| Bun / TypeScript              | `1.3.10` / `5.9.3`                                                 |
| RELKIT package version        | `0.7.7`                                                            |
| Patch SHA-256                 | `10ea188b9409dd19aac7bf27f4b12911ae4844c063362b9c2bd11d6a3d936374` |
| Final minimal template digest | `d9129d4de9f15273b80dc609311ad9ea298dbd1abc14b5e14e286910cf61a771` |

All patch bytes, registrations, dependency pins, the root lockfile and strict compiler settings are preserved. No new suppression was added. The historical [compatibility matrix](compatibility-matrix.md) retains rejected unpatched tuples; those failures are not relabeled as successes. Current preservation and moved-history hashes are recorded in [final-preservation.json](acceptance/final-preservation.json) and [final-history-bytes.json](acceptance/final-history-bytes.json).

## Local source checks

[final-checks-results.json](acceptance/final-checks-results.json) contains exact argument vectors, working directories, exits, PIDs and timings. Completed gates include:

- 35 native migration/catalog/registry/package tests, 249 assertions.
- 9 generator/platform/transaction tests, 50 assertions.
- 14 focused documentation tests, 487 assertions.
- Incremental CLI/generator compilation with a 512 MiB Node heap; docs typecheck with a bounded 768 MiB heap.
- Sync-release validation twice without version/lockfile drift, deterministic release-note generation/check, CLI reference freshness, and syntax compilation of all seven changed MDX pages.
- Boundary validation across 62 roots and 4,993 TypeScript files, authoring lint, konsistent validation and strict OpenSpec validation.
- Earlier sample typechecks/auth execution, documentation links/search/JSDoc checks and 92 authoring-fragment checks remain recorded in [acceptance-verification.md](acceptance-verification.md).

The 512 MiB docs typecheck exhausted its heap. That failed attempt is retained under [source-gates-512-attempt](acceptance/source-gates-512-attempt/); the 768 MiB run passed. A scoped MDX check initially resolved from a symlink path incorrectly; canonical dependency resolution passed afterward. These were not reported as successful attempts. No full-repository build, prepush, hosted CI, release or cloud operation is claimed.

## Independent packed consumers

[packed-results.json](acceptance/packed-results.json) records 49 successful commands and their installed identities. The final archives are the exact same 53 SHA-256 identities used by certification, verified in [final-archive-identity.json](acceptance/final-archive-identity.json). Both `create-relkit` and `relkit create` ran outside the monorepo using the candidate registry, with no first-party published fallback, source links, inherited patch or copied runner.

Both entrypoints passed clean/frozen installation, check, typecheck, tests, build, preparation and live production greeting HTTP. No-database help/check/dev preparation also passed while the consumer could not resolve ORM or Kit. The transitive ORM was restored for ordinary application tests afterward.

Both existing-database-to-auth and auth-created-database flows passed installed generation/migration, unchanged no-op log rows, a subsequent migration, preserved business rows, check/typecheck/test/build and production HTTP signup/sign-in/session cookies/denied-and-allowed access/revocation. Acceptance added explicit test-only environment values, a protected account resource and a business-schema extension where needed; it did not replace auth with a mock. All 65 installed skill/reference files match their current source bytes.

The private registry now requests compact npm metadata and releases completed response bodies rather than retaining an unbounded response cache. The focused regression tests verify that behavior and preserve the missing-candidate rejection. Failed earlier network/setup attempts and the stopped duplicate installer remain in their original logs. Checkpointing prevented completed SQL from being automatically retried.

## Real database and guidance acceptance

- [PostgreSQL](acceptance/postgres-results.json): 22 commands, actual isolated PostgreSQL, explicit nested config in a path with spaces, custom migration-log schema/table, current/fresh/subsequent history, invariant repeat logs/data, invalid SQL failure, generated auth check/typecheck/build and real production HTTP sessions/access checks.
- [MySQL](acceptance/mysql-results.json): 20 commands with the same migration/data/failure/auth contracts against an actual isolated MySQL 8.4.11 server. Verified official bottles were extracted into a temporary directory; no system service was installed. These server-dialect fixtures explicitly use local package links and are not described as independently packed installations.
- [Guidance execution](acceptance/guidance-results.json): existing SQLite/auth extended with separate users/orders resources, trusted session ownership, invalid-input rejection, scoped lists, revocation, preserved existing notes, real generated migrations and production network HTTP. The explicit fullstack fixture passed backend/web typechecks and production builds, then one-worker Playwright acceptance for real greeting updates, invalid input, controlled failure/retry, preserved content/wrapper and mobile controls.

The independent evaluator's exact runtime identifier is `gpt-6.1-sol`, verified from its own child-session metadata in [runtime-model-metadata.json](final-guidance/runtime-model-metadata.json). The earlier 14-case intent/onboarding/discussion/bug matrix is retained in [guidance-forward](independent/guidance-forward/REPORT.md). The concrete users/orders and fullstack cases, literal requests, actual plans, source, diffs, hashes and corrections are under [final-guidance](final-guidance/AUTHORING-HANDOFF.md), with the final read-only assessment in [FINAL-EVALUATOR-ADDENDUM.md](final-guidance/FINAL-EVALUATOR-ADDENDUM.md).

Initial authoring errors, a stopped Next implicit type installer and an over-broad browser alert locator are recorded separately. The parent corrected the test locator to distinguish the application's alert from Next's route announcer; application source was unchanged. The final browser run passed. This is compiler/runtime-informed iterative evaluation, not a claim of first-attempt success or evaluator-executed runtime checks.

## Certification and cleanup

The existing rollback-safe certification driver regenerated the admitted minimal/examples/no-jobs/no-cloud/no-deploy tuple using final bytes. No tuple was promoted and the strict one-second threshold was unchanged.

| Set     | Runs |    Median |       P95 |   Maximum | Result |
| ------- | ---: | --------: | --------: | --------: | ------ |
| Fresh   |   20 | 574.63 ms | 855.83 ms | 858.50 ms | Pass   |
| Restart |   20 | 568.52 ms | 766.62 ms | 883.87 ms | Pass   |

See [certification-fresh.json](acceptance/certification-fresh.json), [certification-restart.json](acceptance/certification-restart.json) and [final-audit.json](acceptance/final-audit.json). Exact committed baseline reports and the earlier completed certification before the final guidance correction are retained separately. The unrelated `separate-release-readiness-performance` change remains hash-identical.

Heavy work was serialized with a shared lock, resource admission checks, bounded heaps, one-worker tools and reduced priority. Final cleanup checked actual native processes, not only wrapper exits. It caught MySQL PID 6090 surviving its wrapper, attempted SIGTERM, then required a bounded SIGKILL; [mysql-cleanup-remediation.json](acceptance/mysql-cleanup-remediation.json) records that correction. The harness now captures/verifies the native PID for future runs. The raw earlier MySQL wrapper-exit flag alone was insufficient cleanup proof and is superseded by that remediation and the final inventory.

[final-cleanup.json](acceptance/final-cleanup.json) records no remaining owned processes and removal of retained consumers, database files, bottle libraries, candidate archives, lock and temporary caches. No Chromium headless shell remains. Unrelated user processes were not stopped. No required acceptance blocker remains.

## Delta requirement mapping

| Delta requirement                                   | Tasks         | Concrete evidence                                                                                     |
| --------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------- |
| Backend scaffolding omits unsolicited frontend      | 4.1, 4.4, 5.3 | database-ownership/platform tests; packed flows; users/orders fixture                                 |
| Ignore framework output and retain migration source | 4.2, 6.4      | five-template real Git ignore tests; final skill/archive audit                                        |
| Current Drizzle repair remains unchanged            | 1.2, 2.1–2.5  | compatibility matrix; preservation hashes; sync/catalog/rollback tests; clean/frozen packed installs  |
| History belongs to the database service             | 4.1, 4.3, 4.5 | all-dialect generator tests; moved hashes; generated and real history proofs                          |
| RELKIT owns migration execution                     | 3.1–3.3       | native config/target/history/SQLite tests; actual PostgreSQL/MySQL results                            |
| Migration dependencies load lazily                  | 3.6           | missing-consumer dependency tests; packed ORM/Kit-absent help/check/prepare                           |
| Results follow ownership/output conventions         | 3.5           | secret-safe JSON/failure/cancellation tests; actual failed SQL and final native-PID cleanup           |
| Sample history remains stable                       | 4.3           | unchanged four-file hashes; applied-history move/no-op test                                           |
| Changed templates have fresh independent evidence   | 6.2, 6.4      | 53 exact archives; 49 packed commands; 20 fresh plus 20 restart measurements                          |
| Skills adapt to task intent                         | 5.1           | actual feature/bug/discussion/mixed evaluator cases and before/after hashes                           |
| Onboarding resolves only missing choices            | 5.2           | explicit/unspecified/no-database/conflict/small-change evaluator cases                                |
| Optional modules require intentional selection      | 5.2           | optional versus requested realtime/provider cases; installed CLI option checks                        |
| Guidance defaults to backend resource contracts     | 5.3           | corrected users/orders check/tests/build/network proof; explicit fullstack build/browser proof        |
| Migration guidance separates history and machinery  | 4.5, 5.3      | source-backed docs/MDX tests; actual generated/shared-command migrations                              |
| Completion requires behavior evidence               | 5.4, 6.1–6.3  | original bug cases; honest unavailable-reproduction case; real HTTP/browser/database acceptance       |
| Experimental boundaries are explicit                | 5.6           | reviewed AGENTS/CONTRIBUTING/app-skill diff; unchanged protected separate change                      |
| Distributed guidance stays synchronized             | 5.5, 6.4      | 13 files per template; 105 valid links; 65 installed byte comparisons; recorded model/source evidence |

# Implementation status — 2026-10-10

The change is implemented for the single published capability tuple. The work
remains uncommitted and has not been released or deployed. Docker and paid cloud
acceptance were not run because no shipped tuple requires them.

## Shipped capability

The versioned capability table publishes exactly this normalized tuple:

| Template | Jobs | Cloud | Deploy | Examples |
| --- | --- | --- | --- | --- |
| `minimal` | `none` | `none` | `none` | `on` |

Interactive creation only presents certified choices. Headless requests for any
other tuple fail before staging or installation and include the rejected tuple
and supported alternative. This keeps the broader parser vocabulary available
for candidate measurement without representing an uncertified tuple as shipped.

The entry is bound to RELKIT `0.7.2`, Bun `1.3.10`, TypeScript `5.9.3`, snapshot
protocol `1`, template `default/v1/minimal`, the template digest, and the two
named certification reports. Details are in `capability-evidence.md`.

## Readiness certification

Every duration measures literal `bun dev` invocation through receipt of the
complete and correct public `/hello` response. Polling is at most 5 ms. Every
recorded run returned the expected body and was below the strict, unrounded
500 ms threshold.

| Set | Runs | Median ms | nearest-rank p95 ms | Maximum ms | Outcome |
| --- | ---: | ---: | ---: | ---: | --- |
| Fresh independently installed projects | 20 | 412.567146 | 426.025458 | 448.075334 | Pass |
| Unchanged restarts after an uncounted warmup | 20 | 402.7976875 | 416.239042 | 416.937417 | Pass |

The complete host, executable, package, prerequisite, attempt, outcome and raw
duration records are in `certification-default-fresh.json` and
`certification-default-restarts.json`. The reports' SHA-256 digests at review
time are respectively
`ecf4de0d8e302dad6d4e8aa9cb43fb90e678b67e2ec816f8101a3c2024d306f5` and
`2e19fe5f2fb75bea3fc68a0bd2864691dbaf9a448d1f61cc179712b951533b9a`.

## Implemented behavior

- Finite creation-time preparation reuses a current successful check receipt,
  publishes an immutable content-addressed snapshot, and opens no listeners.
- Snapshot validation covers complete inputs, tool/dependency identity, sealed
  artifacts, relocation, environment separation, cohort integrity and epochs.
- Fast activation bypasses compiler and bundler imports, starts the verified Bun
  candidate, proves the live generation through the supervisor and only then
  reports readiness.
- HTTP route imports are partitioned from the split-bundle metafile. Deferred
  modules use per-generation memoized imports, retain shared module identity,
  and include their verified transitive chunks in the route import index.
- Authentication, middleware, precedence, limits, mapping, response validation,
  tracing, streaming, cancellation and retirement continue through the common
  Hono/engine path on first and subsequent requests.
- Inspector and telemetry support start independently. Early telemetry is
  redacted before admission, bounded by count and bytes, reports retained loss,
  and hands off in order to the canonical store.
- Packed installed creation, `--no-install`, frozen reinstall, generated checks,
  development, graph/OpenAPI/reference/inspector, build and production start are
  covered by external-process acceptance.

The complete scenario-to-test mapping is in `fault-matrix.md`; the semantic and
Effect review is in `source-audit.md` and `effect-source-evidence.md`.

## Registry compatibility resolution

During external packed acceptance, current AWS SDK package metadata referenced
transitive patch versions that were not published. Root overrides pin the
nearest published compatible `credential-provider-*` and `nested-clients`
versions. The packed install and acceptance run passed with those pins.

## Final verification

- Focused route, snapshot and capability Vitest: 24 files, 74 tests passed.
- Focused resolver and generation-presentation Bun tests: 12 tests passed.
- `bun run test:docs`: 102 tasks and all 53 documentation tests passed;
  generated references, TypeScript, JSDoc, links and search checks are current.
- `bun run test:generator`: 20 initial tests, both compilation/addition cohorts,
  and the final 93-test generator cohort passed, including packed external
  creation and candidate-only agent/fullstack lifecycle acceptance.
- `bun run prepush`: frozen installation, formatting, lint, boundaries,
  consistency, observability, all 53 package typechecks, repository TypeScript,
  public type fixtures, unit, compiler, graph, contract and security gates passed.
- `openspec validate fast-generated-dev-readiness --strict --no-interactive`
  passed, and `git diff --check` reported no whitespace errors.

## Rollback

Remove the capability-table entry first so creation rejects the tuple. Existing
projects remain safe because invalid, missing, stale or incompatible snapshots
already fall back to the ordinary full validation path. Reverting the prepared
activation integration restores the previous startup path; content-addressed
snapshot directories are cache state and can be left for ownership-aware cleanup.

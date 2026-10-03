# Execution Effect alignment acceptance

## Scope and ownership

Implementation began on 2026-10-02 at 12:28:36 UTC from commit
56cb00a4e09f7908d456848e69f6b623bd859c84. The complete uncommitted implementation
was transferred to the primary checkout at the user's request. Remaining acceptance
work began there at 16:21:31 UTC. No cloud execution, deployment, commit or push was
performed.

Final acceptance closed at 19:43 UTC: approximately 7 hours 15 minutes from
implementation start and 3 hours 22 minutes for the primary-checkout follow-up.
All required local implementation and acceptance tasks are complete. The changes
remain uncommitted; the limitations below remain part of the review evidence.

The initial worktree verification completed at 16:07 UTC, about 3 hours 39 minutes
after implementation began. Its results below are historical evidence. Follow-up
results in the primary checkout are recorded separately and supersede the earlier
unresolved acceptance findings where explicitly stated.

Every original authored TypeScript file was reviewed through EOF. Final inventory
includes hidden and ignored authored files, excluding dependencies, generated/build
output, binaries and the read-only Effect reference.

| Package         | Original files | Final files | Suites | Passing tests |
| --------------- | -------------: | ----------: | -----: | ------------: |
| runtime-effect  |             27 |          44 |     10 |            52 |
| providers-local |            109 |         190 |     19 |            79 |
| engine          |             75 |         129 |     24 |            99 |
| runtime-hono    |            127 |         237 |     40 |           126 |
| Total           |            338 |         600 |     93 |           356 |

The combined run enables the optional official MCP Inspector scenario. All 73
original suites and their helpers moved into their owning package tests directories.
The default Hono run retains one optional MCP skip. Strict source/test/example
types and checked composition examples pass. No scoped implementation exceeds 250
lines. The AST documentation check covers 1,263 named callables with no missing
summary, parameter, result or generic tags; semantic descriptions and resource
ownership were also reviewed.

## Initial worktree verification

- Frozen install: passed; external dependency pins remain unchanged.
- Workspace production build: 58 of 58 tasks passed.
- All four strict test typechecks and package formatting: passed.
- Complete recursive package discovery: 543 Vitest suites passed, with 2,209 tests
  passed and one optional skip; both Bun cohorts passed 360 tests across 114 files.
  One obsolete CLI help snapshot is reported as an advisory.
- Phase-zero guardrails: 27 passed.
- Public declaration scan: 16 packages passed.
- Observability sink scan and synthetic secret scan: passed, zero secret matches.
- Integration: 47 passed, three opt-in Docker cases skipped in the default run.
  Separate Redis/MinIO Docker lifecycle: passed, 25 assertions.
- Restart: eight passed. Compiler: 144 Bun tests plus 175 graph Vitest tests passed.
- Contracts: 83 passed. Unit: 17 passed. Security: three passed. Inspector: nine passed.
- Generator: 94 distinct cases passed in an isolated run. Earlier concurrent
  generator/performance runs timed out; those results were superseded.
- Examples: 154 Turborepo tasks passed.
- Deployment: 14 passed, one opt-in AWS test skipped. Container: three passed.
- Explicit jobs commands, type/contracts/client/inspector/matrix checks: passed.
  Jobs coverage: 91.87% branches, 95.33% statements, 98.23% functions,
  97.27% lines. Mutation verification passed its semantic requirements:
  478 killed, 239 survived, 14 uncovered, 735 total mutants.
- Documentation test suites: 42 passed. The separate public-authoring JSDoc gate
  has 11 failures outside the execution packages, reproduced in the original checkout.
- Structural configuration validation: passed. Structural advisory scan reports
  existing other-package barrel findings, with no findings in these four packages.
- Strict OpenSpec validation: passed.

Repository verification passes install/no-diff, whole-repository formatting, lint,
boundaries and sink checks, then stops at the unchanged 260-line
packages/functions/src/define-function.types.ts. This exceeds the existing global
250-line limit and lies outside the implementation scope.

The recursive package run exposed three baseline DuckDB fixture failures, reproduced
in the original checkout: the default seven-day retention deletes fixed September
25 records on October 2. Persistence/import fixture tests now explicitly configure
retention through existing options; production storage/query behavior is unchanged.
The source naming guard also identified four new Hono references, corrected to
the repository's observation/stream terminology.

Four CLI fixtures now link their declared app/testing dependencies rather than
assuming root workspace hoisting; the complete 106-test Bun CLI cohort passes.
The final stream audit also required a narrow production correction in the owning
invocation handler bridge. Native signal composition for declared streaming output
retains deferred cancellation while preserving exact output identity, nonstream
signal disconnection and existing callback listener cleanup. Owning handler-bridge
tests and sixteen engine lifetime/metric tests cover the correction.
Overlapping heavy provisional verification runs exceeded timing limits; sequential
final acceptance retains the original deadlines.

Packed Docker release readiness remains failed after two attempts. The first passed
minimal and Inngest, then timed out exercising Effect MQ HMR. Its SQL-PG listener
warning is a separately reproduced baseline SDK/API mismatch. The isolated retry
passed minimal, then timed out and crashed Bun 1.3.10 during Inngest HMR. The native
crash is not proven to be a baseline failure. Owned temporary resources were cleaned
up. Cloud acceptance and deployment were not run.

## Initial worktree performance

Raw reports are retained beside this file:
performance-baseline.json, performance-final.json and performance-comparison.json.
Measurements used the same corrected existing workload harness, Bun 1.3.10 and
Apple M1 Pro, without competing tests/builds in the final runs.

Alternating-order repetitions on the exact final source confirm a material regression:
direct median latency increased 32.6–41.1% and HTTP route median increased 37.0–41.6%;
p95 increases were 14.7–39.5% and 24.6–36.0%, respectively. Profiling and optimizations are documented
in design.md. Named-function stack capture and required context/span/metric work
remain measurable overhead. The regression is unresolved and is not a passing
performance result.

Jobs, events and the static request-stream workload improved in the full harness.
The unchanged inspector workload also improved, which may reflect cache/variance.

The full workload report predates the final stream refinements; the alternating
comparison was refreshed at 16:05 UTC on the exact final source, after all test and
build workers finished.

## Vendor evidence

The original ignored repos/effect checkout was read without modification. Core
implementation/test files and its manifest are missing. Retained persistence,
process, observability, named-function and AI examples/tests informed the selected
patterns. Each missing or mismatched API was checked against installed Effect
4.0.0-rc.115 and covered by focused local regression where needed. Stream.withSpan
is verified against installed Stream/Channel implementations and executable
documentation, retained Chat usage, and a controlled local consumption-span test.
Specific gaps and domain exceptions are recorded in design.md.

## Primary-checkout acceptance

The follow-up resolves the earlier line-limit, public JSDoc, LISTEN compatibility,
packed HMR and latency findings. All implementation remains uncommitted in
/Users/mustafaelsayed/Workspace/relkit.

- The first primary `bun run verify` passed its complete fixed fail-fast pipeline
  at 17:49:45 UTC, before the final logging and absent-hook optimizations. Frozen
  install and generated-file no-diff passed. Workspace build,
  lint, whole-repository formatting, boundaries, structural configuration,
  source/test/example types, documentation and all configured test cohorts passed.
- Final verification completed on the accepted source in sequential stages.
  Successful unchanged stages were retained from the final full run; corrected
  integration and generator stages were rerun before continuing the original
  verifier commands in order. The final tail passed at 19:40:42 UTC, including
  fresh packed Docker readiness, security/redaction, secret and declaration scans.
  Final phase-zero passes 28/28 with 168 assertions; lint and the complete
  `git diff --check` pass. The Git index remains empty.
- Final recursive package discovery: 546 Vitest suites, 2,229 passing tests and one
  optional skip; Bun cohorts passed 254 and 111 tests. Total: 2,594 passes.
  Explicit MCP Inspector acceptance also passed. The advisory obsolete CLI
  snapshot and existing other-package structural findings remain unchanged.
- Packed Docker readiness: passed all minimal, Inngest, EffectMQ, API, agent and
  fullstack exercises, both direct and CLI installation paths, live additions,
  builds, dev/HMR, terminal behavior and byte-deterministic regeneration.
  Release validation covers 52 packages/artifacts and five template kinds.
  Owned temporary projects and child processes were removed. The earlier Bun
  crash did not recur in the successful run.
- Jobs quality: 95.33% statements, 91.87% branches, 98.23% functions and 97.27%
  lines. Mutation semantic verification passed: 478 killed, 239 survived,
  14 uncovered, 735 total. Stryker now excludes only root CodeGraph tool state;
  its mutation/test targets and acceptance criteria remain intact.
- `bun test tests/phase0.test.ts`: 28 passed, including authored-versus-generated
  coverage scanning, public exports and isolated frozen-install consistency.
- Public declaration scan: 16 packages passed. Observability sink scan passed.
  Synthetic secret scan: 15,043 files, zero matches. Security/redaction and
  agent declaration/source/graph checks passed.
- Final source documentation audit: 1,263 named callables, zero missing summary,
  parameter, result or generic tags. All 600 authored files remain covered,
  including all 338 originals. Every scoped implementation meets 250 lines.
  Scoped test totals are 52 runtime-effect, 79 providers, 99 engine and 126 Hono
  with MCP enabled: 356 tests across 93 suites. The final recursive package run
  passes after the additional logging, hook and provider-cleanup regressions.

Focused follow-up regressions cover cached metrics across isolated registries,
caller attributes and owned-label collisions, original causes and controlled
durations; actual SDK queue/broadcast LISTEN adaptation; HMR responsiveness,
recovery and process-group cleanup; and already-aborted native agent fixtures.
The latter passed five successive focused repeats before full verification.

An intermediate final rerun passed build, generated-file consistency and types,
then exposed ENOTEMPTY in the generation-retirement fixture. A native
readControls/recoverExpiredControls/store.update Promise could still write after
its cancelled observer and accepted execution settled. The fixture now registers
application-owned provider Promises and joins them before directory removal.
Seven equivalent direct-process suites use the same cleanup owner. Bun child
providers are already reaped before parent removal. The held-read regression
fails when provider registration is disabled and passes when restored; five
focused repeats pass 25/25 tests, and all eight affected suites pass 24/24.
No production behavior, cleanup retries or test deadlines changed. The refreshed
complete package cohort passes on this source.

The next final run passed every verification stage through provider contracts,
then exposed an integration assertion still expecting an empty task-hook span.
The assertion now requires the real lifecycle/invocation spans, rejects absent
hook spans, and retains annotation and started/completed span balance checks.
The focused engine integration suite passes 7/7; complete integration, restart,
Inspector API and explicit MCP acceptance also pass after the correction.

Generator acceptance then exposed a five-second timeout in the reused Docker
profile test. It performs project compilation but was classified into the
additions cohort, overlapping the compilation cohort. It passes alone in
2.9 seconds. Moving its existing name into the compilation cohort preserves the
deadline and assertions; the complete generator command passes 94/94, with the
affected fixture completing in 3.3 seconds.

Final verification resumes sequentially from each corrected stage instead of
repeating successful unchanged stages. The original verifier commands and order
are retained. Logs are `/tmp/relkit-execution-final-acceptance.log`,
`/tmp/relkit-execution-final-acceptance-resume.log`,
`/tmp/relkit-execution-final-generator.log`, and
`/tmp/relkit-execution-final-acceptance-finish.log`. The final tail passes;
`/tmp/relkit-execution-final-phase0.log` and
`/tmp/relkit-execution-final-lint.log` retain the final guardrail results.

### Final performance

`performance-primary-comparison.json` records three alternating-order rounds of
200 direct and HTTP operations per implementation, with warmups. The original is
an isolated git-archive snapshot of HEAD 56cb00a4e09f7908d456848e69f6b623bd859c84;
the candidate is the final primary source with rebuilt internal dependencies.
Both use the existing pinned external dependencies, Bun 1.3.10 and Apple M1 Pro
on macOS arm64. All owned build/test workers had finished before measurement.

| Round | Direct median change | Direct p95 change | HTTP median change | HTTP p95 change |
| ----: | -------------------: | ----------------: | -----------------: | --------------: |
|     0 |              −12.13% |            −3.17% |             −7.07% |          −0.60% |
|     1 |              −12.24% |            −9.41% |            −11.95% |          −9.12% |
|     2 |              −15.40% |            −8.62% |             −8.85% |          −0.96% |

Every final round stays below the 5% median and 10% p95 investigation thresholds.
These results supersede the material regression in the initial worktree report.
The implementation hoists a repeated instrumentation function definition, caches
bounded immutable metric handles, batches synchronous metric bookkeeping, avoids
inaccessible implicit HTTP log retention and skips spans for absent task hooks.
Named service operations, required spans/counters/logs, caller context, label
precedence, defects/interruption and observational failure isolation are retained.
Metric-context regressions failed before the collision correction and pass afterward.
Provisional runs that overlapped documentation, tests or builds were discarded
as contended measurements; the final report is an isolated run on the accepted source.

`performance-primary-recorded-comparison.json` repeats the comparison with trace
completion hooks and an actual HTTP recording sink. Both implementations receive
200 initial warmup operations for each workload, then three alternating rounds of
200 measured operations. Operation-heavy calls perform ten trace operations each.

| Round | Direct median / p95 change | Operation-heavy median / p95 change | HTTP median / p95 change |
| ----: | -------------------------: | ----------------------------------: | -----------------------: |
|     0 |            −6.32% / +0.19% |                   −18.16% / −15.68% |          −2.94% / +4.21% |
|     1 |            −9.30% / −7.28% |                   −17.19% / −10.23% |          −2.99% / −0.64% |
|     2 |            −8.85% / −5.18% |                    −12.84% / −6.60% |          +0.85% / +6.63% |

All recorded rounds also stay below the investigation thresholds. The retained
`performance-primary-recorded-before-hooks.json` documents the preceding
8–12% median and 8–19% p95 HTTP regression. CPU profiling and one-request record
attribution identified two empty named task-hook spans for absent observers.
The guard removes those spans; actual configured hooks retain tracing, ordering,
context and diagnostic failure isolation, verified by three regressions.

`http-records-before-hooks.json` and `http-records-final.json` preserve the record
attribution. The final request emits 37 records versus HEAD's 25, down from 41.
Its six additional Info logs belong to independent service operations; one additional
lifecycle span and four invocation annotations supply required domain telemetry.
HTTP status and body are identical. Removing required logs or custom-redactor
projection was not necessary to meet the thresholds. A proposed projection shortcut
was rejected because custom-redactor prototype/depth inputs changed; a focused
regression now protects those semantics and in-place redactor sanitization.

`performance-primary-workloads.json` refreshes the complete existing harness on
the final source at 18:30:09 UTC. Direct median/p95 is 8.833/13.594 ms, HTTP
10.725/15.212 ms and static request stream 0.215/0.271 ms. Jobs complete all 100
operations in 3,366.293 ms; events complete all 800 deliveries in 33,586.361 ms.
These improve on the initial workload baseline. Inspector layout is unchanged;
its 408.353 ms result reflects host/cache variance as well as the surrounding run.

The same full harness quantifies recording activation within the candidate:
direct +6.195% median/+11.359% p95, operation-heavy +13.484%/+15.650%, HTTP
+36.395%/+31.599%. Recording itself retains a material cost. Profiling and exact
record attribution account for the additional admitted/redacted lifecycle logs,
spans and annotations. The alternating HEAD comparisons above hold recording
configuration constant and measure the migration; every final round meets the
investigation thresholds. Required logging and redaction remain enabled.

The refreshed unpaired execution-query sample is 1.162/4.764 ms median/p95 versus
the initial 0.736/1.303 ms (+57.88%/+265.62%). It assembles a synthetic 512-span
graph through unchanged observability code, late in the full harness after the
recording workloads. `performance-primary-query-comparison.json` repeats this
query in five alternating rounds of 1,000 operations, with 200 initial warmups
and ten per measurement. Both implementations use byte-identical query code,
harness, contracts and observability sources, the same realpath Effect rc.115,
and the same 513-record fixture. Complete output JSON hashes match.

| Round | Query median change | Query p95 change |
| ----: | ------------------: | ---------------: |
|     0 |              +3.24% |         +153.36% |
|     1 |              −2.10% |           +2.41% |
|     2 |              −4.28% |           +3.55% |
|     3 |             −10.88% |          −27.21% |
|     4 |             −12.26% |          −35.79% |

No repeatable median migration regression appears in the isolated comparison.
One round retains a material tail increase: 1.961 ms versus 0.774 ms p95.
The large full-harness increase was not consistently reproduced. Its cause is
unassigned; the comparison does not prove a GC, host or allocation-history cause.
This query-tail limitation remains explicit alongside the passing execution
comparisons, and the unchanged query implementation was not altered.

### Exclusions and limitations

Dependencies, generated/build output, binaries and vendor code are excluded from
authored coverage. The incomplete read-only vendor checkout remains unchanged;
installed rc.115 source and focused local regressions resolve the documented API
gaps. External dependency pins remain unchanged.

Cloud/AWS, deployment, commits and pushes remain outside this task. Default
integration tests retain three opt-in Docker skips; packed Docker acceptance ran
separately through repository verification. The new dev-check worker guarantees
POSIX descendant process-group cleanup; Windows direct-child cleanup is implemented,
but Windows descendant cleanup and platform acceptance are unavailable on this host.

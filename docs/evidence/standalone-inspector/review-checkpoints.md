# Stage 2 review checkpoints

These are scoped observations on 2026-10-23, not final acceptance.
All logs below are retained under `/tmp/relkit-s2-config-20261023-01a1663e/`.

## Review findings and corrections

The independent read-only review found boundary defects. Each failed regression
was retained before its correction; no numeric ceiling was raised.

| Boundary                       | Correction and current evidence                                                                                                                                                                 |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exact record size              | Reserve the full transport envelope, including its separator; exact-bound/one-over replay passes, `capture-exact-bound-green-2.log`.                                                            |
| Collector persistence envelope | Count the same session/sequence identity projection used by persistence; the near-full batch commits without blocking later records, `collection-rebind-green-1.log`.                           |
| Foreign project rebind         | Fence historical and live requests before publishing selection or waiting for writer cleanup; parent-owned history scope, `history-parent-scope-green.log`.                                     |
| Route console                  | Forward ordinary business paths with original media type, auth and generation fence; strip inspection credentials from business handlers, `route-private-header-green.log`.                     |
| Native operation observation   | Observe history/remote/collector/tool operations; suppress repetitive successful polling logs while retaining metrics and failures, `service-observation-green.log`.                            |
| Pending producer queue         | Count waiting plus active records/bytes against 2,048 / 4 MiB; count the complete `{records}` transport body against 1 MiB. Eleven queue regressions pass, `pending-producer-bounds-green.log`. |
| Historical query protocol      | Preserve native invalid-query/protocol codes as 400 and reuse header negotiation, with private native causes excluded.                                                                          |
| Container UI health            | Enforce the documented internal UI port 3210; host publication can choose another port.                                                                                                         |

The final two corrections and the new producer regressions pass together:
12 cases, `query-container-producer-green.log`. The reviewer independently
reproduced both producer defects and confirmed the corrected 2,048 total pending
ceiling and accepted split HTTP batches. A fresh final review remains required.

## Native storage and application observations

Actual WAL replay preserves session/sequence receipts, later revisions of the
same span and old-generation attribution. Corrupt storage, unwritable directory
and killed-worker cases preserve existing bytes and committed data while the
business listener remains available: five cases / 20 assertions,
`history-revision-fault-native-1.log`.

Ordinary reload recovery uses the actual separate built tool. Rejected edits
retain the old typed route; repair updates route/OpenAPI/UI without refresh or
changing app/tool PIDs. All owned descendants join:
`standalone-recovery-ordinary-1.log`. Prepared recovery still needs its current
full browser gate.

## Certification and broader gates

The real creation certification producer passes 20 fresh and 20 restart samples,
retaining its source digest and raw observations. Fresh p95 489.91 ms; restart
p95 495.69 ms, scoped to this host and workload:
`creation-certification-current-1.log`.

The installed packed CLI passes 80 assertions for lean development, prepared
repair, frozen checks, type/test/build/start: `generator-installed-lean-2.log`.
The broader generator rerun then found provider-example comment drift; matching
the authoritative generator comments passes its focused case,
`generator-jobs-guidance-green.log`. The full generator gate is still open.

Retired Stage 1 path exemptions are removed from live policy. Regressions now
reject all former UI/native exceptions, including when supplied explicitly:
`retired-exemptions-green.log`. Historical Stage 1 evidence is preserved.

The first full current build passed 61 tasks and failed documentation typecheck
on an incomplete new inspector example missing required `env`:
`current-root-build-1.log`. The example is corrected; the second run is pending.
The corrected full build passes all 62 tasks (`current-root-build-2.log`).
The first prepush attempt stopped at formatting, before later checks:
`current-prepush-1.log`. No full verify/prepush acceptance is claimed here.

The root container gate now builds exact candidate archives/image and owns its
builder, image, inputs and cleanup. A dedicated read-only Ubuntu CI job runs
that same real gate. Local execution and hosted CI remain separate evidence;
the updated root wrapper now passes seven real tests / 48 assertions:
`current-root-container-1.log`. Exact Linux arm64 image identity:
`sha256:9ceac7a99d3895c62dc0e3ebd379d65d87e3883cfabeb2940a66d3888e034e7f`.
The owned image, builder, staging, archives, containers and networks were removed.

## CLI operation classification and native jobs correction

The core CLI has no historical log/trace/history commands or inspector alias.
Graph, environment and check commands use authored/compiler metadata. Jobs
definitions, capabilities, run queries/control and schedules use live native
providers; trigger/watch also use existing business RPC. Historical diagnostic
logs, requests and traces are served by the optional standalone tool.

The review found the new stable proxy fence blocked native jobs REST, and rich
registration required the private inspection token. Native reproduction returned
404 with inspection omitted and 401 at the inspected generation. The correction
registers only selected development jobs on the canonical eager app before its
listener, independently of inspection. Existing middleware and the original
optional `RELKIT_INTERNAL_ENDPOINT_TOKEN` bearer plus per-service authorization
remain authoritative; private inspection credentials do not replace them.
Generation retirement joins the registered native jobs owner.

Five native cases / 24 assertions pass (`native-jobs-ownership-green-1.log`),
covering omitted/enabled proxy access, configured bearer denial, exact operation
ID/cookie forwarding, no rich routes and production absence. Eighteen scoped
jobs policy/prepared transport cases also pass (`native-jobs-policy-current.log`),
and existing CLI/native jobs compatibility passes (`native-jobs-existing-compatibility.log`).
These fixes invalidate the prior build/merge evidence for the affected CLI/API
artifacts; those gates must be rerun before final acceptance.

## Final review corrections and merge checks

The independent reviewer read 169 authored runtime/script/fixture files through
EOF, retaining exact hashes and per-file failure, environment, lifecycle and
observation notes in `stage2-final-review.json` under the log directory. The
review's remaining limitations are documentation/test exhaustiveness and actual
runtime acceptance; static review does not certify those gates.

Three confirmed final-review defects are corrected. Interrupted producer flushes
restore record bytes without the transport wrapper; its failing exact-4-MiB
regression is retained and 12 queue/capture cases pass
(`interrupted-queue-bytes-red.log`, `interrupted-queue-bytes-green.log`). CLI
output pruning rejects intermediate `commands` and `dev-snapshot` symlinks;
both preservation regressions failed before correction and all four prune cases
now pass (`prune-intermediate-symlink-red.log`,
`prune-intermediate-symlink-green.log`). Both trace-list consumers accept the
collector's `span.updated` invalidation, and the main trace list renders the
existing history-status disclosure. Four cases / 21 assertions pass, including
actual producer-to-consumer event selection (`trace-invalidation-green-2.log`).

Current prepush attempts retain every failure: sink ownership registration,
an untyped test JSON response, retired `inspector.port` type configuration,
an integration test placed across the UI package boundary, and the old scaffold
unit fixture expecting a CLI-owned UI proxy. These are corrected without
changing the acceptance requirements. The root build after native jobs changes
passes 62 tasks (`current-root-build-3.log`); final prepush/full gates and exact
candidate consumer measurements remain pending.

The first full run passed build/no-diff and all type gates, then failed the
package cohort: 773 files / 2,992 cases passed; nine files / 14 cases failed.
Retained log: `current-prepush-full-1.log`. Three assertions still expected old
Inspector configuration/emission or record-only byte accounting; those fixtures
are corrected. Mock workers now emit actual close events. Sixteen focused
fixture cases pass (`full-package-fixture-fixes.log`).

The full run also exposed a real Node shutdown regression. Explicitly
disconnecting the parent IPC channel could suppress Node's child `close` event,
leaving the new physical-close join unresolved after the process exited.
`node-close-events-red.log` reproduces ACK/disconnect/exit with no close. Removing
the premature parent disconnect retains kill, close/stdio join and deadline
escalation; `node-close-events-green.log` observes close and settled cleanup.
All six affected native/packed/mocked storage files pass: 19 cases,
`node-storage-close-green.log`. The independent reviewer checked the installed
Node implementation and both event logs. The complete full run must still pass.

## Current scoped acceptance and remaining gates

The second full run passes its 782-file Vitest cohort: 3,006 cases, five existing
conditional skips. Its Bun cohort stops at three obsolete CLI assertions:
209 cases pass, three fail and five conditional cases skip. Their migration
retains core start behavior and moves rich metadata/history/native-agent checks
to the separate tool. The focused migrated cohort now passes seven cases /
92 assertions (`cli-native-owner-migration-green.log`), including actual native
agent output, completed request/span correlation, redaction and distinct
invocation IDs across cursor pages. Current root TypeScript passes
(`cli-native-owner-types-3.log`). Earlier attempts retain missing Origin and
generation-header failures plus the premature/wide request-detail assertions;
the final fixture polls a typed completed-span projection before asserting.
Log: `current-prepush-full-2.log`. No failed full run is accepted.

The current lightweight Inspector API gate passes 14 cases / 66 assertions,
including real agent RPC and durable human-input resume:
`current-inspector-api-1.log`. Certification passes 14 Bun and ten Vitest cases
with five existing native-input-watch opt-ins skipped:
`current-certification-2.log`. Separate scoped native reload/prepared/traffic
ownership evidence remains in `dev-bridge-native-2.log` and
`current-prepared-ownership.log`; skipped opt-ins are not counted as native proof.

These complete the scoped session and bridge tasks, together with the native
history/fault and exact-limit C1 gates already recorded above. Stage 2 is 20/29:
12.3, 15.5, 17.1–17.3 and 18.1–18.4 remain open. Fresh packed-tool proof,
documentation/example/generator/release checks, the final external consumer
matrix and actual full native/browser/scaffold/container acceptance are required.
Current package registration acceptance closes 17.3: C3 passes its 65-root /
5,536-file boundary check and Konsistent configuration validation
(`current-registration-check-1.log`, `current-registration-konsistent-1.log`).
The current 118-case unit gate includes independent tool/bin/runtime metadata,
archive/retired-CLI policy, mandatory container CI and release classification,
packing and export contracts (`current-owning-test-unit-1.log`). Publication
remains separately authorized. The current task count is 21/29; the earlier
20/29 statement records its checkpoint.

The host previously reported memory pressure level 2, deferring heavy reruns.
At the current preflight pressure is 1 with admission permitted; owning gates
have resumed without raising resource limits or stopping unrelated processes.

The serial owning-gate cohort now passes unit, compiler/graph, contracts,
integration, restart, Inspector API, MCP Inspector, generator, examples and docs.
Command/result index: `current-owning-gates-2.log`; individual full logs are
`current-owning-test-*-1.log`. Examples complete 157 tasks; docs complete 102
tasks, including 66 cases / 2,224 assertions, 32 public API JSDoc checks and
160-page link/search checks. The full prepush/native/consumer gates remain open.

Expanded guidance review then found default-Scalar and dev-owned-storage wording
in three already changed guides. The guides now distinguish JSON OpenAPI from
selected Scalar and assign durable history/UI/workers to the separate tool.
The authoritative docs producer passes (`docs-generate-current-2.log`);
the fresh full sequence must revalidate these latest guidance corrections.

The third full run passes 62 build tasks, no-diff/types, the complete package
gate (782 Vitest files / 3,006 cases plus both Bun cohorts), unit, compiler,
contracts, integration, restart, Inspector API and MCP. It then fails installed
creation: a cached CLI entry imports missing `prepared-prepare-*.js` chunks
(`current-prepush-full-3.log`). The actual build cache omits ten referenced
chunks; its entry is byte-identical to the typecheck cache's complete older
cohort (`prepared-cache-archive-red.log`). Three direct producer runs each yield
complete closures (`prepared-direct-producer-closure-3.log`).

A real isolated Turbo replay reproduces older runtime restoration for both CLI
and tool: two red cases (`packaged-typecheck-cache-red.log`). Typecheck caching
is disabled only for those two packaged-runtime owners; both cases now pass
with ten assertions (`packaged-typecheck-cache-green.log`), and the regression
is registered in certification. Root TypeScript passes. No existing cache was
deleted. Fresh/cached build, external creation and the complete gates remain
required; the exact asynchronous cache-corruption interleaving was not measured.

The first native replay still hits the old corrupt build cache and stops at
its closure audit (`cache-owner-native-gates-1.log`). The packaged build inputs
now include `turbo.json`, so output-ownership policy changes invalidate those
artifacts. The two original cache archives are preserved under `preserved-cache-*`.
Attempt 2 passes fresh build, cached replay and actual typechecking with the same
entry SHA-256 and complete 22-file prepared closure; no missing imports
(`cache-owner-native-gates-2.log`). External installed creation then passes one
case / 80 assertions, including prepare/recovery/manual commands/production start
(`cache-owner-installed-2.log`). Complete final gates remain open.

Prepush 9 passes with the cache regression registered. Full run 4 passes
build/no-diff/types and all 782 Vitest files / 3,006 cases. Its CLI Bun cohort
reports 211 pass / five conditional skips / one failure: the migrated fixture
required `request.functionId` before the valid started request was bound
(`current-prepush-full-4.log`). The model declares that field optional. The
fixture now accepts early snapshots and polls both final binding and completed
span before retaining the original strict correlation assertion. A deterministic
started/completed codec case and native owning cohort pass eight cases /
94 assertions (`cli-native-progressive-request-green-2.log`); TypeScript passes.
Unvisited browser/native gates will run before the next complete sequence.

Independent S2-R8 review confirms that the optional intermediate codec does not
weaken the final request/span assertions. The current ledger covers 395 paths,
including 304 EOF reviews; all eight findings are corrected with no source hash
drift. Browser admission attempts 1–2 deferred before running any gate because
the host reported memory pressure level 2. Original limits remain unchanged.

Unvisited browser attempt 4 reaches bucket pagination, then its physical Preview
click is covered by the sticky header. The saved screenshot/accessibility tree
are under `.relkit/inspector-browser-9ocL0f/`; the original failure remains
`unvisited-test-inspector-browser-4.log`. The test now explicitly scrolls Preview
into view before the same click; every pagination/preview/security assertion is
retained. Attempt 5 passes all history/resource/graph/agent/HITL/thread-history
browser scenarios and ordinary native reload rejection/recovery, then fails the
prepared recovery step (`unvisited-test-inspector-browser-5.log`). This complete
gate remains failed. Its recovery artifacts were copied to `recovery-native-red-1/`.

S2-R9 traces the prepared omission to production bundling with the existing
`bundleInputInventory` preparation marker: the new build emitter had omitted
inspection and native job administration for that development-only artifact.
Both fields now recognize the existing prepared marker. Ordinary production
omission and runtime production/session-token/native authorization guards remain
intact. Independent source review confirms the caller and guards. Source tests
pass three cases / 47 assertions; format, AST/size, whitespace and strict OpenSpec
checks pass. Corrected native recovery and final acceptance remain required.

Prepared diagnostic 10 obtains the actual runtime generation through the tool:
no descriptor initially, then disconnected 503, then authenticated runtime 200
with `generation-1`. Cleanup joins two owned descendants and confirms listener
release (`prepared-recovery-diagnostic-10.log`); its disposable project is removed.
Full rejection/repair and ordinary production isolation remain unaccepted.

Browser attempt 7 reaches a second sticky-header obstruction on Previous
(`unvisited-test-inspector-browser-7.log`, `.relkit/inspector-browser-wEssgn/`).
The correction is now shared by the browser driver: explicit scroll followed by
the original physical click, both inside the same 60-second timeout and caller
abort signal. The one-off resource scenario edit is reverted to baseline bytes.
Two driver regressions / four assertions pass, including failure propagation
without clicking (`browser-driver-scroll-green-2.log`). Independent EOF review
covers the driver and regression; current inventory is 397 paths / 306 EOF.
Actual browser rerun is pending resource admission, with all prior reds retained.

Attempt 12 passes production isolation: one real generated-server case / eleven
assertions, including business/core probes, rich API absence, no bridge discovery
and production override attempts (`unvisited-production-isolation-12.log`). The
complete `test:inspector:browser` command then passes every feature scenario and
both ordinary/prepared rejection/repair workflows
(`unvisited-test-inspector-browser-12.log`). Dev/tool PIDs remain independent and
unchanged through failed/repaired generations; four ordinary and two prepared
owned descendants join shutdown, and both listeners become unavailable. These
current owning results close S2-R9 and task 15.5, bringing Stage 2 to 22/29.
The serial queue proceeds to container/native gates with unchanged admission
limits. No failed full run or deferred gate is reclassified as passed.

Container attempt 12 builds current packages and verified image input, but its
image-build command fails at 180 seconds; builder/input cleanup succeeds and the
candidate archives remain under `relkit-container-gate-efReTt`
(`unvisited-test-container-12.log`). That failure remains unaccepted. The native
adapter's compact failure does not retain the failing Docker stage, so no exact
cause is claimed. Diagnostic attempt 1 omitted the image helper's required Scope
and stopped before Docker; the corrected diagnostic reuses the exact retained
archives and unchanged Dockerfile/one-CPU/768-MiB/180-second bounds. Attempt 2
passes in 126,275 ms, producing Linux arm64 image
`sha256:1e2c89487e58cb6d1a7eb1dd26f76841a9fe7acb6d87df578ded74c303dc8813`
and zero cleanup errors (`container-build-native-diagnostic-2.log`). Detailed
plain output is retained in `container-build-native-diagnostic-output-2.log`.
This is build-only evidence; complete container acceptance still requires a
passing root gate, with no timeout or recipe change inferred from the diagnostic.

The unchanged complete root container retry passes seven cases / 48 assertions
(`unvisited-test-container-13.log`): Docker Desktop host bridge, Linux
host-gateway identity, private Docker network, foreign-project history fencing,
production context, readiness separation and bounded shutdown. Exact local image
is `sha256:64a880c60727aa90835bbd5d8a2c6e049738f99a9881cc03fdb5d0f929d453dd`
(Linux arm64, non-root `bun`); actual builder limits remain one CPU / 805,306,368
bytes. Builder, image, input and successful candidate-directory cleanup complete.
The prior failure remains retained; no unobserved original timeout cause is
asserted. The serial queue advances to actual scaffold/native acceptance.

The remaining attempt-13 native gates pass: complete packed scaffold acceptance
(`unvisited-test-scaffold-13.log`), local Redis/MinIO adoption and persistence
(one case / 25 assertions, `unvisited-test-local-docker-13.log`), and local
deployment contracts (14 cases / 78 assertions, one existing paid-AWS opt-in
skip, `unvisited-test-deployment-13.log`). No paid cloud test ran.

S2-R10 is a confirmed browser-fixture setup omission: the Inspector fixture now
requires an owned project root, but its Playwright backend environment supplied
only the selected port. Attempt 13 stopped with `Browser fixture project is
required`; Commerce passed two cases with one existing opt-in skip. The config
now supplies the selected artifact directory's project child and a fresh token
only to the frontend server's private BFF environment. Independent review finds
no public credential, browser token header, assertion or deadline change. This
resettable memory fixture remains UI evidence, separate from actual standalone
tool authentication evidence.

Attempt 14 starts correctly and passes 50 Inspector cases, but two visual
references fail (`unvisited-test-e2e-14.log`). Commerce again passes two cases
with its existing opt-in skip. The retained expected/actual/diff images under
`.relkit/playwright-inspector-fm7WFR/results/` show the intended collection-status
panel in Logs and a one-pixel trace panel height/raster shift; the trace retains
all nine steps and their data. Only these two images are being regenerated by
the scoped Playwright producer. No screenshot threshold, assertion, worker count
or timeout is relaxed. A fresh complete E2E run without snapshot updating remains
required. Historical failed runs remain failed.

The scoped producer refresh passes exactly two cases and writes only those two
reference images (`visual-reference-refresh-1.log`). Independent image review
confirms the intended history panel, preserved log fields and identical nine
trace steps. Attempt 15 then passes the complete unchanged E2E command without
snapshot updating: 52 Inspector cases and two Commerce cases, with one existing
Commerce opt-in skip (`unvisited-test-e2e-15.log`). The runner restores generated
Next source files. This closes S2-R10's owning setup proof; final repository and
external-consumer acceptance remain open.

The attempt-15 jobs gates pass: coverage runs 69 files / 242 cases and the
unchanged configured mutation semantic gate passes (501 killed, eight timeouts,
267 survived, 17 uncovered; score 64.19%, `unvisited-test-jobs-quality-15.log`).
This is the existing semantic acceptance rule, not a claim that every mutation
is detected. Jobs Inspector passes eight cases / 24 assertions; the compatibility
matrix and its actual Docker provider run also exit zero
(`unvisited-test-jobs-inspector-15.log`, `unvisited-test-jobs-matrix-15.log`,
`unvisited-test-jobs-docker-15.log`). Release readiness then waits at the existing
memory-pressure admission guard. The final external matrix will precede the
last complete full verification so any package defect can be resolved first.
The provider suite proves its two required native engines, Inngest and Effect
MQ. Its existing Trigger self-hosted profile remains `not-tested`: a supported
release-pinned image and registration/authentication configuration are absent.
No Trigger acceptance or paid-cloud coverage is inferred from the command pass.

Release attempt 15 packs and reaches its root boundary check, which falsely
classifies PNG bytes at `logs-workspace-darwin.png:92:845` as an alternate
infrastructure name (`unvisited-release-check-15.log`). S2-R11 is the existing
text-extension regex: its TS/JS branch was unanchored and matched `.spec.ts`
inside the screenshot directory. Grouping the existing alternatives under the
final `$` corrects file selection without a new exclusion or file type.
The native scoped regression first fails on that extra image finding, then
passes four assertions: image content is ignored while the same forbidden token
in real TypeScript still rejects through the actual CLI
(`scope-extension-red-1.log`, `scope-extension-green-1.log`). Complete Phase 0,
root boundary and release reruns are queued serially as attempt 16.

Attempt 16's full Phase 0 run passes 28 cases and fails one stale guidance
assertion after 367 seconds (`unvisited-phase0-guardrails-16.log`). Its packed
export smoke is broader than the scanner correction needed. The failing
assertion still requires `RELKIT_INSPECTOR_ROOT` in user guides; runtime source
no longer uses that override. Current guidance facts instead require explicit
inspection selection, loopback connection guidance and the standalone guide,
retain the README's private-UI topology assertion, and reject the retired env
recommendation. Focused native scope/guidance and root boundary checks replace
another broad sweep before the final external candidate/matrix. The original
full failure is retained; complete full verification remains required at the end.
Focused scope/guidance passes four cases / 82 assertions
(`current-scope-guidance-focused-1.log`); root boundary validation passes 65
roots / 5,538 TypeScript files (`current-boundary-after-png-1.log`). Independent
EOF review covers the updated pure guidance facts and caller. The fresh external
build/candidate/matrix queue starts at 22:05 Riyadh time, with the normal resource
guard before each operation (`current-external-final-1.log`).

The fresh build passes all 62 tasks in 194 seconds (`final-build-1.log`). Packing
produces 56 archives under `/tmp/relkit-stage2-final-20261023-0PpISL/artifacts`,
manifest SHA-256 `c686611dc7024d2f1a813736de19d5cf087678da376f912b1b9475593d3fd461`
(`final-pack-1.log`, `final-candidate.json`). The direct external verifier then
fails before tool launch because its awaited module entrypoint precedes the
`const verifyRunners` and `writeReport` initializations (`final-standalone-1.log`).
The unchanged entrypoint is moved below both helpers; no assertion or runtime
candidate byte changes. The failed external fixture and original log remain;
its bridge and registry close. Attempt 2 resumes at standalone proof against the
same archives, then proceeds to the external matrix (`current-external-final-2.log`).
The corrected direct invocation passes against those identical archives
(`final-standalone-2.log`, `final-standalone/result.json`): both installed runners,
real UI/history and redaction, cache removal/restart with identical history,
tool uninstall with backend survival, and separate CLI closure (66 instances,
no missing requirement, zero forbidden paths). Scope finalizers close the UI,
worker, backend, bridge and registry, then remove the successful fixture.
This closes task 12.3, bringing Stage 2 to 23/29. The 92-sample final installation
matrix starts at 22:14:53 (`final-install-matrix-2.log`).

The first measurement report retains five observations: two complete Bun
cold/warm pairs and one cold-only partial before resource deferral. The user then
explicitly authorizes proceeding despite RAM/CPU warnings. The waiting owned
controllers are stopped and joined (code 143, no live owned PIDs), preserving
that report. Attempt 3 resumes unfinished profiles with the existing
`RELKIT_CONSUMER_IGNORE_RESOURCE_LIMITS=1` operator override. Actual resource
observations remain logged; heavy operations remain serial and worker/test
limits are unchanged. Timing remains descriptive, not performance certification.
No repository resource policy is changed.

All original installation pairs are now selected in `final-install-selected.json`:
22 Bun profiles and eight each for isolated Bun, npm and pnpm, for 92 samples.
Every selected sample has no failure or missing dependency; the seven generic
profiles per manager also pass the final installation policy with no exceptions.
The disposable controller unnecessarily started a second pnpm attempt. Its owned
producer did not settle after SIGTERM and was killed after the termination grace;
the controller then joined. `cancelled-duplicate-pnpm.json` preserves its log,
nine checkpoint hashes, owned PIDs and cancellation reason. None of its samples
is selected. The original complete pnpm report remains unchanged.

The serial queue resumes directly at the 28 independent four-boundary profiles
(`current-external-final-4.log`), followed by the actual final-policy CLI,
relocated native production and matrix report. The existing operator override
remains enabled under the user's explicit authorization; worker counts, command
timeouts and zero-cloud settings remain unchanged.

All 28 independent profiles pass all four observations, for 112 complete
observations and no forbidden paths (`final-boundaries-4.log`). The actual final
policy CLI also passes every profile with no exceptions (`final-policy-4.log`).
These close 18.1, bringing Stage 2 to 24/29. Relocated native production starts
against the same packed candidate; the matrix report and complete final
repository sequence remain required.

Relocated production and the matrix producer both exit zero
(`final-relocated-production-4.log`, `final-matrix-report-4.log`). Native and
Docker auth/SQLite, worker output, minimal HTTP, selected Scalar and bounded
shutdown pass against the final candidate. `final-matrix.json` retains the
92 selected samples, 28 profiles / 112 observations, zero exceptions and
46 numeric budgets, plus historical provenance and failed/partial attempts.
The cancelled duplicate's exact log and nine raw checkpoints are retained
separately with zero accepted samples. The final frozen-install/prepush/full
sequence starts with the existing user-authorized resource override; no source
or documentation edits are made during its build/no-diff window.

Sequence 5 passes frozen installation and prepush 10. Its full run passes build,
generated-file no-diff, types, all package cohorts (782 Vitest files / 3,006 cases,
plus Bun), unit/compiler/contracts/integration/restart/Inspector/MCP,
generator/examples/docs and jobs gates. Current mutation acceptance passes with
501 killed, seven timeouts, 268 survived and 17 uncovered (64.06%, 18m7s).
Release readiness then stalls in native staging: invocation has 180 of 469 files,
no child command or CPU activity, and the sampled main thread/pools are idle
(`release-staging-native-sample-1.txt`). The identical isolated copy passes in
301 ms and eight forced-GC copies pass (`release-copy-gc-diagnostic-1.json`);
the intermittent stall is not deterministically reproduced or attributed to an
upstream cause. SIGCONT does not recover the process. Only the owned release
process is terminated and joined; Full 5 remains interrupted/failed, code 1.
Its original log and partial staging directory are preserved.

S2-R14 changes only the four staging copies to synchronous native copies with
the same recursive/filter options, README fallback and cleanup/rethrow behavior.
The native preservation regression and the two existing real pack tests pass
four cases / 523 assertions: exact member set and every content hash across
500 nested modules plus hidden/binary bytes, excluded build caches, metadata,
license/README and missing required input. This protects content/error semantics;
it is not a deterministic reproduction of the asynchronous stall. Focused format
checks pass. Fresh actual release readiness starts in
`release-staging-workaround-native-1.log`; current complete acceptance is pending.

The fresh actual release command exits zero: 56 packages validated/packed,
53 selected release artifacts and five templates, including root boundary,
declaration/Postgres/export and packed scaffold smoke. A retained comparison
with the measured candidate finds 54 identical archive hashes. Tool differences
are six added Next route-cache files; CLI differences are additional prepared
chunk files, with the executable entrypoints byte-identical. The complete
member/payload comparison is `post-staging-content-comparison.json`; differing
files are not treated as byte-identical or as new measured samples. The original
92-sample candidate remains unchanged. Current strict root TypeScript and
whitespace checks pass. Sequence 6 repeats the actual frozen-install/prepush/full
commands after the delivery-only workaround and then runs the pending complete
Phase 0 guardrail; source/docs remain frozen during its build/no-diff window.

Sequence 6 passes frozen installation and prepush 11, then full build/no-diff,
types, package cohorts, 122 unit cases and compiler/provider contracts. Its
integration cohort reports 62 pass / three existing skips / one failure:
`links an event continuation to a retrying receipt job` exceeds the unchanged
default 5,000-ms limit (5,004 ms). Full 6 exits one and remains failed
(`current-prepush-full-6.log`). An immediate unchanged focused invocation passes
all nine assertions in 184 ms (795 ms total). No assertion failure or underlying
cause is established, and no timeout, source or assertion is changed. The actual
owning integration command reruns serially in `integration-timeout-owning-1.log`
to check the same case in its shared process/cohort context before another
complete acceptance attempt.

The unchanged complete integration rerun exits zero: 63 pass / three existing
skips / 578 assertions; the previously timed-out case passes in 146 ms within
the same five-second limit (`integration-timeout-owning-1.log`). No source fix
or timeout increase is made and the original timeout cause remains unproven.
Sequence 7 runs the pending complete Phase 0 guardrail first, then the actual
`prepush:full` command. Prepush 11 remains current because source is unchanged;
the full command repeats its own frozen-install/build/no-diff order.

Independent archive review proves the selected 23 CLI/prepared modules, including
19 reachable chunks, have identical payload hashes and no missing literal imports
in both candidates. All 33 differing chunk paths are outside that selected
closure and unmentioned by other JS/JSON/declaration payloads. The tool adds six
generated root-page cache records (69,567 bytes); its original 572 members are
unchanged. These are distinct fresh producer archives, not substituted measured
identities or new samples; the original candidate and numeric budgets remain
unchanged. This does not reproduce the earlier missing selected chunk defect.

Sequence 7's complete Phase 0 guardrail passes 29 cases / 180 assertions in
325.18 seconds (`current-phase0-guardrails-17.log`). Its actual full-prepush
command passes the complete fixed-order verification, including unchanged
integration (63 pass / three skips / 578 assertions), release staging and packed
delivery. The mutation semantic gate passes in 17m58s with 501 killed, seven
timeouts, 268 survived and 17 uncovered. Native provider, scaffold, container
(seven tests), local Docker, deployment (14 pass / one existing cloud skip) and
Inspector browser/recovery commands also complete successfully.

Full 7 then fails at final E2E: Inspector has 50 passes / two failures in 7.9m;
Commerce has two passes / one existing skip in 13.5s. Both failed Inspector
flows exhaust the unchanged 30-second whole-test deadline near their final
navigation. Retained traces show successful HTTP 200 responses and long earlier
navigations: the function click takes 13.559s; the tool and agent page visits
take 15.861s and 6.482s. The fresh Next development fixture precompiles only
`/graph` before interaction deadlines. These observations do not establish a
product defect or an exclusive cause. Full 7 remains failed, code 1; its original
log and `.relkit/playwright-inspector-QveOFS` failure evidence are preserved.
An unchanged, serial reproduction of only those two tests uses the same worker,
30-second test and five-second assertion limits
(`e2e-timeout-focused-unchanged-1.log`).

That unchanged focused run reproduces both failures. Trace call logs show stable
clicks and successful navigations, while the native Next log attributes 12.4s
of the 13.5s tool response, 6.3s of the functions index, 5.4s of its detail and
4.7s of the agent page to development compilation. Cold compilation is a
confirmed contributor; the host's exact contribution remains unproven.

S2-R15 adds only native Playwright `beforeAll` compilation preparation to the
two owning specs. The installed 1.63 implementation gives each hook a separate
timeout slot and disposes its request fixture after the hook. Sequential GETs
must return exactly HTTP 200 with complete buffered bodies; failures propagate
without retry or fallback. The hook has a 120-second compilation budget; each
original test retains 30 seconds, each ordinary assertion five seconds, and the
suite one worker. All original reset hooks, assertions and physical actions stay
unchanged. No application or Next cache policy changes are included.

The initial three-route preparation passes the contracts flow in 7.6s, including
its preceding 11.5s flow, but leaves the request flow's proxy/request/detail/log
compilation inside the interaction deadline. The complete owning cohort has six
passes / one timeout (`e2e-compilation-owning-1.log`); warmed function responses
drop to 243–324ms while cold Logs compilation reaches expiry. This partial
attempt remains failed. Request preparation now covers its complete navigation
path, including the BFF and dynamic detail pages. Its next seven-case owning
proof is `e2e-compilation-owning-2.log`; final full acceptance remains pending.

The complete corrected owning cohort exits zero: seven cases pass in their
actual file order, including the preceding contracts flow
(`e2e-compilation-owning-2.log`). Both original regressions are exercised with
their unchanged 30-second test/five-second assertion budgets; scoped native
server teardown and source restoration complete. This is focused fixture proof,
not a replacement for the actual complete command. Sequence 8 runs fresh prepush
and then full-prepush after this two-file correction; source and evidence are
frozen throughout that run. The final installation candidate, its 92 samples,
112 boundaries and numerical budgets are unchanged by these test-only hooks.

Full 8 exits one at the final log-loading assertion: 51 Inspector cases pass,
one receives zero rows while application queries remain pending, and Commerce
has two passes / one existing skip (`current-prepush-full-8.log`). The earlier
two compilation flows pass in 7.3s and 9.5s. The new delay is application-side
waiting, not observed route compilation; a product cause or exclusive host cause
is unproven. No source, assertion or deadline changes follow this failure.
The unchanged actual-order log pair passes 16 cases in 1.0m, target 3.9s
(`e2e-logs-owning-unchanged-1.log`). The unchanged complete browser command then
exits zero with 52 Inspector cases in 4.8m and two Commerce cases in 11.7s /
one existing opt-in skip (`e2e-complete-unchanged-1.log`). These scoped reruns do
not alter Full 8's failed status.

Sequence 9's actual complete `bun run prepush:full` exits zero, joined by its
runner (`current-final-sequence-9.log`, `current-prepush-full-9.log`). It preserves
the frozen-install/build/generated-no-diff order, passes all 39 core checkpoints
and completes native providers, packed scaffold, container (seven passes),
local Docker (one pass), deployment (14 passes / one existing cloud skip),
Inspector browser/recovery and final E2E. Inspector passes all 52 cases in 3.2m;
Commerce passes two in 11.4s with its existing opt-in skip. The previously failing
request, contracts and log flows pass in 7.7s, 5.7s and 3.9s. Mutation's semantic
gate passes in 11m58s: 501 killed, seven timeouts, 268 survived, 17 uncovered,
64.06%; no complete mutation-detection or performance claim is inferred.

The source remains unchanged from Full 8 through these successful runs. All 319
reviewed authored-file hashes match before final evidence reconciliation. The
owned-resource audit (`final-owned-resources-9.json`) finds no surviving browser
PIDs, repository Next server, task container or owned Inspector image. Unrelated
CodeGraph and stopped logistics MinIO resources are preserved. HEAD and the
Drizzle patch SHA remain unchanged. Prepush 12 and Phase 0 guardrail 17 remain
current. Historical failed commands, the exact measured candidate, 92 samples,
112 independent boundaries, 46 budgets and timing limitations are retained.

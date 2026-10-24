# Stage 1 implementation evidence

Status: **Stage 1 accepted: 39/39 tasks. Stage 2 unstarted: 0/29 tasks**.
Historical observations remain in [initial-attempt.md](./initial-attempt.md)
and [baseline.json](./baseline.json).

Current acceptance record (2026-10-23):

**7.5, 10.2 and 10.3 are complete. Stage 1 passes its functional/isolation gate.**
Stage 2 remains unstarted under the user's explicit scope. No commit, push,
publication, cloud provisioning or storage cleanup was performed.

### Owning final commands

All five commands in `/tmp/relkit-s1-final-stage1-gates-2/index.json` physically
closed with exit zero. Each log has its exact invocation in `.command.json` and
its verified SHA-256/exit code in `.closed.json`:

| Gate | Actual command/result | Log in that directory |
| --- | --- | --- |
| S1.7 C3 | `bun scripts/tests/server-runtime/packed-production.acceptance.ts /tmp/relkit-stage1-candidate-20261022-b22/artifacts`; relocated host and Docker production pass | `01-packed-production.log` |
| S1.7 C1 | `bun run vitest run --maxWorkers=1 --no-file-parallelism packages/engine/tests/server-runtime`; 30 cases across eight files pass | `02-s17-lifecycle.log` |
| S1.7 C2 | `bun run test:deployment`; 14 pass, existing opt-in AWS case skipped | `03-s17-deployment.log` |
| Regular gate | `bun run prepush`; complete command passes | `04-prepush.log` |
| Full gate | `bun run prepush:full`; complete uninterrupted command passes | `05-prepush-full.log` |

The full-command log SHA-256 is
`19f401c9a4f5bc2b62ddb3b5bb8548349830d4c2e8e5869d71a5f37861ce10d1`.
It passes the fixed verify sequence, generated-output no-diff, all required native
Docker providers, packed scaffold, container/local-Docker and deployment checks,
Inspector browser and ordinary/prepared reload recovery, then the complete E2E
command: 52 Inspector cases and two Commerce cases pass, with the existing
opt-in generated-project case skipped. Ordinary/prepared recovery joins 11/nine
owned descendants and verifies listener unavailability; both browser fixtures
restore their sources and release their backend/frontend PIDs. Earlier failed
canonical commands remain failures; no component composition substitutes for this
actual whole-command pass.

The unchanged jobs quality gate passes with coverage 96.06% statements, 91.2%
branches, 97.67% functions and 97.22% lines. Its complete native report retains
all 793 outcomes: 501 killed, 268 survived, 17 uncovered and seven timeouts.
Raw copy: `/tmp/relkit-s1-final-stage1-gates-2-jobs-mutation.json`, SHA-256
`cb89b4620543589d4969b48820731bc1ffd0ce50a74c9c577aed9254751fe29a`.
No threshold, static mutation, assertion or timeout was changed in this final run.

### Exact candidate and isolation evidence

All 55 b22 archives remain unchanged at
`/tmp/relkit-stage1-candidate-20261022-b22/artifacts`, manifest SHA-256
`2f2c46a6b4d1c834a9acd00f671d581a6ccac88ae52b8eaf648acd5740343d64`.
The [b22 matrix](./stage-1-b22-matrix.json) verifies 84 successful installation
samples, 28 generic profiles and 112 independent installation/evaluation/
declaration/artifact observations across Bun normal/isolated, npm and pnpm,
including 14 selected cold/warm pairs. All 281 input hashes still match.
Eight minimal/API installation cohorts each retain exactly 33 manually reviewed
CLI Inspector UI/history path exceptions; their other boundaries and the other
20 generic profiles have none. Original raw failures, explicit path admissions,
review receipts and completed consumer cleanup receipts remain retained. No new
path was automatically admitted, and final-policy forbidden observations remain
visible for Stage 2.

Exact-candidate normal/isolated strict declarations, selected provider isolation,
eight direct native-agent cases, mixed Redis/offline deployment, all four creator/
wrapper flows, and the exact 36-case S1.10 C2 cohort passed before the final
sequence; their source/archive bytes are unchanged. Generic strict consumers use
`skipLibCheck=false` and `exactOptionalPropertyTypes=true`. The supplemental
selected native-agent probe retains its independently reproduced upstream
limitation requiring `exactOptionalPropertyTypes=false`; no declarations are
stubbed or suppressed.

Warm-owned-cache Bun measurements are separate fixtures, with logical bytes shown
exactly. Historical missing-edge observations remain in the matrix; no baseline
functional pass, timing certification, reduction percentage or cross-profile byte
total is inferred. General testing has no comparable baseline because its native
Bun listener-typing fixture changed. All selected-integration and other-manager
measurements remain in the full matrix.

| Fixture | Baseline instances | b22 instances | Baseline logical bytes | b22 logical bytes |
| --- | ---: | ---: | ---: | ---: |
| creator-only | 18 | 10 | 79,525,134 | 51,140,055 |
| wrapper-only | 352 | 11 | 690,886,689 | 51,157,044 |
| minimal-development | 380 | 97 | 731,050,304 | 561,618,853 |
| api-development | 379 | 97 | 724,901,360 | 561,618,853 |
| production-only | 55 | 20 | 251,490,410 | 57,276,987 |
| generic-server-client | 32 | 19 | 60,734,255 | 54,497,350 |
| general-testing | n/a | 60 | n/a | 103,717,230 |
| agent-development | 382 | 121 | 740,357,855 | 615,917,853 |

### Production contract and Docker resolution

Production launches from the relocated project root using
`NODE_ENV=production bun run --no-env-file .relkit/build/server/index.js`.
Bun installs only the emitted production dependencies in isolated layout into
`.relkit/build`, followed by another relocation and developer-install removal.
Startup receives explicit application environment, `RELKIT_ENV=production`, an
allocated `PORT` and empty `NODE_PATH`. No checkout, CLI, compiler, Inspector/history
store, Pulumi or unselected SDK supplies runtime files. Generated output contains
the selected external modules, native binary, worker and assets. Minimal HTTP,
selected workers/Scalar, SQLite migrations/repeat/rollback, auth signup/session/
signout/signin, durable output `42` and physical clean SIGTERM exit pass. Docker
uses the generated command/copy allowlist, substituting only the copied fixture's
candidate-registry address; actual enforced limits remain builder 768 MiB/one CPU
and runtime 512 MiB/one CPU. Runtime auth/jobs and exit zero pass before exact
owned resources settle. Existing data/migrations and the Drizzle repair are preserved.

The first fresh attempt reproduced Docker image-import `no space left on device`:
`/tmp/relkit-s1-final-stage1-gates-1/01-packed-production.log`. Its complete failed
root remains at
`/var/folders/54/3l8wd4hj6c36slgt3rl572sr0000gp/T/relkit-packed-production-vpRmnX`.
A bounded native probe identified Docker's virtual disk at 99% usage. With no
running containers, only `DiskSizeMiB` changed from 14,924 to 32,768, followed by a
Docker restart. The native filesystem then reported about 25 GiB available.
Pre-existing image and volume identities remain present after full acceptance;
no pruning, storage cleanup or unrelated workload shutdown was used. Capacity
receipts: `/tmp/relkit-s1-docker-capacity-{before,after}.json`; original settings:
`/tmp/relkit-s1-docker-settings-before.json`. No product or candidate archive bytes
changed to resolve the environment limit.

### Reconciliation and admission

The [source review ledger](./stage-1-source-reviews.json) retains hash-bound EOF
coverage for all 1,277 reviewed authored files and five generated updates, with
zero current mismatches. Final closure receipt:
`/tmp/relkit-s1-stage1-closed-source-hashes.json`. The exact Drizzle patch SHA-256 remains
`10ea188b9409dd19aac7bf27f4b12911ae4844c063362b9c2bd11d6a3d936374`.
Full example/documentation/producer and release-readiness checks pass. The existing
changeset names 27 tested package owners: 25 existing-package minor changes and
two new-package patch identities. Independent versions remain CLI 0.7.11,
app/LangChain 0.7.10 and observability-local 0.1.0. Relevant docs, examples,
canonical/distributed guidance, manifests and emitted templates retain their
reviewed identities and agree with the tested packs; no release version or
publication command was run.

This record admits Stage 1 only. The matrix producer's `stage1Complete=false` and
`performanceCertified=false` fields describe its measurement-only scope; it does
not evaluate whole native/global admission. The owning command receipts above
establish the Stage 1 functional/isolation decision without rewriting that matrix
or claiming a new footprint timing certification. Hosted CI, publication,
published-registry consumer certification and paid/cloud acceptance are separate and unrun.
Optional Trigger Docker remains explicitly untested because its pinned image,
registration and authentication prerequisites are unavailable; retained native
reports also keep their unsupported native guarantee limits. Stage 2 stays 0/29.

## Historical checkpoints

The following checkpoints retain the original failures and intermediate passes.
Their pending-work statements describe that checkpoint; the current status above
supersedes them.

### Earlier b22 checkpoint

Current checkpoint (2026-10-23):

- Fresh b22 is packed as 55 archives at
  `/tmp/relkit-stage1-candidate-20261022-b22/artifacts`, manifest SHA-256
  `2f2c46a6b4d1c834a9acd00f671d581a6ccac88ae52b8eaf648acd5740343d64`.
  Strict normal/isolated consumer cohorts, selected provider isolation, all eight
  direct native-agent cases (36 assertions), mixed Redis/offline deployment and
  all four creator/wrapper flows pass against these packs.
  The fresh [b22 matrix](./stage-1-b22-matrix.json) verifies 84 successful install
  samples, 28 generic profiles and 112 independent installation/evaluation/
  declaration/artifact observations across Bun, isolated Bun, npm and pnpm.
  Its 14 selected pairs each retain cold and warm samples. All 281 input hashes
  still match. Eight minimal/API installation cohorts each have exactly 33
  manually reviewed CLI Inspector UI/history path exceptions; their other
  boundaries and all other generic profiles have none. No new path was admitted.
  Original failed observations and exact review/cleanup receipts remain retained.
  Generic strict cohorts retain `exactOptionalPropertyTypes=true` and
  `skipLibCheck=false`; the supplemental selected native-agent probe documents
  the independently reproduced upstream declaration limitation requiring
  `exactOptionalPropertyTypes=false`. No declarations are suppressed or stubbed.
  Regular `prepush` passes at `/tmp/relkit-s1-b22-main-final-gates/01-prepush.log`.
  The complete E2E command also passes: all 52 Inspector cases and both commerce
  cases, with the existing opt-in generated-project case skipped. Native source
  restoration joins successfully. Log:
  `/tmp/relkit-s1-b22-main-final-gates/02-e2e.log`. Both owning commands close
  with exit zero and retained SHA-256 receipts.
  Owning deployment and starter items 7.1/9.4 are complete: Stage 1 is 36/39.
  Relocated host production passes native workers, Scalar, auth/database/jobs
  and shutdown. The owning production command then fails Docker image export
  with `no space left on device`; its complete failed fixture is preserved at
  `/var/folders/54/3l8wd4hj6c36slgt3rl572sr0000gp/T/relkit-packed-production-qsQU4E`.
  Log: `/tmp/relkit-s1-b22-proof-gates-3/03-packed-production.log`.
  No storage cleanup or Docker settings changes were performed; environment work is out
  of scope under the user's latest instruction. Items 7.5/10.2/10.3 remain open.
  The owning pages file now passes all 21 cases. Exact S1.10 C2 passes all 36:
  `/tmp/relkit-s1-b22-proof-gates-2/01-s110-c2.log`. Its single auth misuse probe
  had a 5.8-second compile against an implicit five-second timeout; it now uses
  the same explicit 30-second budget as the other four real compiler cases.
  Strict flags and exactly one `2322` diagnostic remain unchanged. The earlier
  timeout and incorrect supplemental native-test invocation remain in their
  original failed logs; neither is represented as a functional pass.
  Final source hashes match all 1,277 reviewed authored files and five generated
  updates, with zero gaps; the exact Drizzle patch is unchanged. Receipt:
  `/tmp/relkit-s1-b22-final-source-hashes.json`. Installed strict OpenSpec
  validation passes for this change.

Remaining acceptance is limited to 7.5, 10.2 and 10.3: successful packed Docker
production closure and the complete required command sequence, followed by a
reconciled admission record. The b22 matrix explicitly retains
`stage1Complete=false` and `performanceCertified=false`; matrix success does not
replace those owning gates. Canonical retry 4 remains a failed full command.
Optional Trigger Docker also remains untested because its pinned image,
registration and authentication prerequisites are unavailable. No Stage 2, hosted
CI, cloud acceptance, publication or new performance certification is claimed.

- Canonical retry 4 passes regular `prepush` and every full-command phase
  through native Docker, packed starters, container/local-Docker, deployment,
  Inspector browser and ordinary/prepared recovery. Whole E2E then fails one
  combined workflow at its 30-second aggregate deadline: 47/48 Inspector cases
  pass; both commerce cases pass with the existing opt-in skip. The trace and
  DOM retain the expected route source link and exact editor URL. Opening that
  final cold route detail takes 9.7 seconds, leaving about two seconds for its
  final assertion. This remains a failed whole command at
  `/tmp/relkit-s1-resume-canonical-final-4/`; no component composition is claimed
  as a full pass. Only that workflow is split into five independent cases.
  Agent and source-link cases retain candidate rejection as their precondition.
  AST comparison preserves all 22 assertions, 13 original clicks and timeout
  modifiers; source limits pass. Receipts:
  `/tmp/relkit-s1-resume-pages-{assertion-preservation,source-audit}.json`.
  Owning pages verification and fresh b22 proofs are next; another actual full
  command remains required. Retry 4's separate native mutation report preserves
  all 793 outcomes (501 killed, 268 survived, 17 uncovered, seven timeouts),
  semantic gate passed in 12m31s, at
  `/tmp/relkit-s1-resume-canonical-final-4-jobs-mutation.json`.
- Canonical retry 3 passes regular `prepush`, all full verification phases through
  release readiness, then stops in a security assertion. Bun quotes the probe's
  unexecuted `console.log` source in its error frame; the old substring check
  incorrectly treats that as an emitted evidence marker. Genuine diagnostic and
  exact native log hashes are retained at
  `/tmp/relkit-s1-resume-security-source-frame{.txt,-check.json}`. The probe's
  lexical-before-realpath and canonical containment guards are unchanged.
  Negative cases now use a child-only owned temporary root, cover five unsafe
  paths, and require its directory entries to remain unchanged. The output check
  uses the existing positive case's line-anchored marker semantics. All ten
  security cases pass with 102 assertions:
  `/tmp/relkit-s1-resume-security-frame-green/01-security-frame-green.log`.
  The isolated old substring check happened to pass and is not claimed as a red
  reproduction; the genuine full-command failure remains preserved. No product
  bytes or security boundary is changed. Retry 3 remains a failed whole command:
  `/tmp/relkit-s1-resume-canonical-final-3/`. Its separate native mutation report
  retains all 793 outcomes (501 killed, 268 survived, 17 uncovered, seven
  timeouts); the unchanged semantic gate passed in 13m35s. Another actual full
  command is still required after the fixture-only correction.
- The complete remaining owning continuation passes container, real local Docker,
  deployment, Inspector UI plus ordinary/prepared reload recovery, and the revised
  full E2E command: `/tmp/relkit-s1-resume-after-container/`. Whole E2E now passes
  all 48 Inspector cases and both commerce cases; its existing generated-project
  opt-in case remains skipped. All native listener/source restoration owners
  settle. Current hashes match all 1,276 reviewed authored files and all retained
  generated-artifact updates with zero gaps:
  `/tmp/relkit-s1-resume-source-hash-check-final-3.json`. These owning passes do
  not convert failed canonical retry 2 into a pass. Another actual canonical
  sequence is required before fresh b22 packing; no further source changes are
  planned while that sequence runs.
- Canonical retry 2 passes regular `prepush` and the full verification sequence,
  including the whole generator, examples, docs, jobs suites/quality, release
  readiness, security/public declarations, required real Inngest/Effect MQ Docker
  acceptance and the Docker-enabled packed scaffold (301s). The full shell then
  stops at a container lifecycle request racing listener closure: `ECONNRESET`
  replaces the test's expected 503. This remains a failed whole command:
  `/tmp/relkit-s1-resume-canonical-final-2/`. The original request reproduces with
  its complete fixture retained at `/tmp/relkit-container-test-ZuKeBo`; native
  started/cancelled/flushed markers and generated server bytes remain. The old
  hook had already deleted the first failed root and cannot restore it.
  Runtime source orders bounded drain/flush before listener close. The fixture's
  existing flush callback now performs the real admission probe at that owned
  boundary, before returning; the parent asserts exact `503`/`draining` output.
  No runtime behavior, response-status allowance or 50/100/1000ms deadline is
  changed. All three native lifecycle cases pass with 20 assertions. Failed
  roots now remain; successful roots alone are removed. Logs:
  `/tmp/relkit-s1-resume-container-{red,green}/`; retained facts:
  `/tmp/relkit-s1-resume-container-red-retention.json`. The remaining owning
  gates continue under `/tmp/relkit-s1-resume-after-container/` before another
  actual full rerun. These two fixture-only changes do not alter package bytes.
  Current mutation output is separately preserved at
  `/tmp/relkit-s1-resume-canonical-final-2-jobs-mutation.json`: all 793 mutations,
  501 killed, 267 survived, 17 uncovered and eight timeouts; the unchanged
  semantic gate passes in 13m4s. Optional Trigger Docker remains not tested,
  with the missing pinned image/registration/authentication reason retained.
- The next canonical regular `prepush` passes, while its full command passes
  build/no-diff (61 tasks, 51 cached), typecheck/types, complete package and unit
  suites, compiler/graph/contracts, integration, restart, Inspector and MCP, then
  stops at three local-workspace generator assertions. These are retained at
  `/tmp/relkit-s1-resume-canonical-final/`; this is not a full-gate pass.
  Explicit-peer sharing exposed a real React regression through a transitive
  client owner. The existing native-link branch now keeps Next/React/React DOM
  project-local. Its focused control fails first, then all 15 contributor cases
  pass. The native fixture explicitly selects its LangChain owner, checks the
  existing concrete fallback for an unselected dangling SDK link, and uses the
  independently versioned CLI manifest. All eight native-workspace cases pass
  with 50 assertions; both agent/fullstack starters pass with 41 assertions.
  Logs: `/tmp/relkit-s1-resume-local-peer-red/`,
  `/tmp/relkit-s1-resume-local-workspace-green/` and
  `/tmp/relkit-s1-resume-local-workspace-green-2/`. The existing generator glob
  discovers the sibling test split without runner edits; all four changed files
  satisfy 200-line/below-50-function limits. Failed fixture ownership now retains
  roots, including `relkit-local-web-dependencies-zSAwQE`; roots deleted by the
  earlier unconditional hook cannot be restored. CLI implementation changed, so
  final candidate packing still waits for the repaired source gates.
- The complete browser/reload-recovery gate passes, including visible rejected
  generations, restored routes/OpenAPI, and joined listener/descendant cleanup:
  `/tmp/relkit-s1-resume-remaining-gates-12/01-inspector-browser.log`. Retained
  server output proves the original 1 GiB Next fixture restarted during graph
  compilation; its owner now uses 2 GiB and retains complete joined diagnostics.
  Eight ownership controls pass. Inspector Playwright uses its existing absolute
  same-origin proxy for dynamic ports, preserving backend CORS and local editor
  security. Actual V8 exhaustion and later Next memory-triggered worker restarts
  at lower budgets remain recorded; the complete fixture now has a 4 GiB budget,
  one worker, shared graph readiness and captured native server output.
  Commerce explicitly selects optional AG-UI and prepares its real application
  before listening, with listener/app/state release in order. Both real commerce
  cases pass; the existing generated-project opt-in case remains skipped.
- E2E attempts 15 and 16 remain failed whole commands, respectively 30/31 and
  45/46 Inspector cases passing. Traces prove cold compilation consumed aggregate
  deadlines across independent pages. All fifteen page-heading checks now run
  independently, preserving the original resource click/detail flow. Independent
  graph, trace and Scalar visual cases likewise keep all original interactions,
  screenshot names/options and assertion deadlines; AST comparison confirms all
  28 visual expectation calls are unchanged. All six owning visual cases pass:
  `/tmp/relkit-s1-resume-redesign-focused/01-redesign-focused.log`.
  No retries, golden updates or product UI changes are used. The final canonical
  umbrella remains required and will include the complete revised E2E cohort.
- Deployment now passes 14 cases, with its existing opt-in AWS case skipped:
  `/tmp/relkit-s1-resume-remaining-gates-11/01-deployment.log`. The generated
  golden update and six browser/commerce source reviews are recorded separately
  in the current hash-bound EOF ledger. Source is frozen for the final canonical
  `prepush`, `prepush:full` and exact S1.10 C2 run before fresh candidate packing.
- Full release readiness passes with independent versions (55 manifest owners,
  53 release artifacts, five template contracts), followed by secret/whitespace/
  security/public-declaration/agent-source checks, real required Inngest and
  Effect MQ Docker provider acceptance, standalone scaffold, container and local
  Docker gates: `/tmp/relkit-s1-resume-remaining-gates-10/`. Trigger's optional
  native Docker probe remains explicitly unavailable because no pinned image/
  registration/auth configuration exists; no Trigger execution pass is inferred.
  The deployment suite then exposes one stale golden graph hash. The compiler
  fixture differs from HEAD only in two agent source locations, line 11 to 12.
  A direct current-planner probe reproduces the old golden from HEAD's graph and
  proves every other current plan field is identical. The existing
  `UPDATE_GOLDEN=1` named test producer refreshes only the hash; no plan/assertion
  or implementation is changed. Original golden:
  `/tmp/relkit-s1-resume-deployment-golden-before.json`; probe:
  `/tmp/relkit-s1-resume-deployment-golden-probe.log`. Deployment/browser/E2E
  continuation is `/tmp/relkit-s1-resume-remaining-gates-11/`.
- Release readiness passes packed exports, then its packed minimal scaffold
  rejects the intentionally absent Scalar API-reference UI. Both default and
  incremental-route fixture checks now require 404/no UI while retaining public
  OpenAPI, business routes, graph and Inspector proxy checks. The existing native
  production fixture keeps the explicitly selected Scalar proof. Two real Bun
  HTTP controls fail against the old contract and pass after correction; their
  final owner is the automatically discovered unit cohort. The packed fixture's
  existing Scope Exit now retains failed roots. A genuine repeated failure keeps
  `relkit-create-smoke-2HIcDn`, all four project roots/locks and no direct Scalar
  selection; earlier root deletion cannot be undone. The complete focused packed
  acceptance then passes in 233s, including direct/wrapper creation, post-install
  preparation/frozen reinstall, migration, additions, Docker terminal behavior,
  expected local-only build refusal, both repeated dev cohorts, live route reload
  and joined successful cleanup. Logs:
  `/tmp/relkit-s1-resume-scaffold-http-{red,owned-green}.log` and
  `/tmp/relkit-s1-resume-packed-scaffold-{red,green}.log`.
  No product package changes arise from these verification-only corrections.
  Full release/remaining continuation is now
  `/tmp/relkit-s1-resume-remaining-gates-10/`.
- Jobs quality completes successfully in 15m50s: coverage and the unchanged
  targeted mutation semantic gate pass (501 killed, 267 survived, 17 no-coverage
  reported by the gate). Its raw native report is preserved at
  `/tmp/relkit-s1-resume-jobs-mutation.json` before any later umbrella rerun.
  Jobs Inspector and the account-free capability matrix pass next. Release
  readiness stops first at obsolete `relkit start` expectations; all five
  actual manifests already use canonical emitted JavaScript. The exact full
  script-map regression fails first, then all six release-check cases pass after
  updating the three literal contracts. Logs:
  `/tmp/relkit-s1-resume-remaining-gates-7/`,
  `/tmp/relkit-s1-resume-release-template-{red,green}.log`.
  Release continuation then finds the packed PostgreSQL fixture taking the
  selected Drizzle version from the now-absent ordinary dependency. It now uses
  the exact packed patch/catalog version, preserving strict/skipLibCheck-false/
  exact-optional settings and all four real negative type assertions. Fresh
  native compilation passes; the reproduced failed consumer
  `relkit-packed-postgres-uoodPk` retains source, manifest, lock and installation.
  The earlier deleted failing root cannot be recovered; its release log remains.
  Logs: `/tmp/relkit-s1-resume-packed-postgres-{red,green}.log`; full continuation
  now runs under `/tmp/relkit-s1-resume-remaining-gates-9/`. No product archive
  changes arise from these release-only verifier corrections.
- The complete docs continuation passes all 104 tasks and 66 tests, including
  generated references, 32 public API JSDoc contracts, links and search:
  `/tmp/relkit-s1-resume-remaining-gates-7/01-test-docs.log`. Current raw source
  hashes match all 1,267 retained/incremental EOF review records with zero gaps:
  `/tmp/relkit-s1-resume-source-hash-check.json`. Jobs unit/type/contract/restart/
  client gates pass in the same serial continuation; later gates remain pending.
- Executable examples pass all owning tasks. Docs then reject an obsolete
  assertion claiming MCP default exposure; its focused four cases now assert
  opt-in, enabled-only and default-disabled prose while retaining all access and
  approval controls. The next docs gate finds missing public JSDoc metadata on
  generic `defineAgent` and `createTestApplication`; their original category and
  introduction versions are restored, and the generic declaration receives a
  complete public-schema example. The unchanged 32-API rich JSDoc check passes.
  Existing docs production regenerates API references successfully, including
  the expected category/example/source-line changes. Logs:
  `/tmp/relkit-s1-resume-docs-mcp-focused.log`,
  `/tmp/relkit-s1-resume-remaining-gates-{3,4,5}/` and
  `/tmp/relkit-s1-resume-docs-generate.log`. A prematurely started rerun under
  `remaining-gates-6` is interrupted with its owned process group; it is not a
  passing gate. The serial continuation is `remaining-gates-7`. These source
  comment changes also affect emitted agents/testing declarations, so final
  artifact certification will use a fresh candidate after source gates settle.
- A later local starter fixture exposed contributor tooling's real selected-peer
  gap: it traversed normal dependency declarations only, leaving separate native
  SDK copies after SDK ownership moved to optional peers. The contributor manifest
  now validates peer maps and links only explicitly selected external peers;
  optional first-party domains and unselected SDKs remain unlinked. Both regression
  controls fail before the fix; all 14 contributor cases pass after it. Agent and
  fullstack source starter cohorts then pass all 41 native identity/type/test/
  frozen-reinstall/addition/frontend/readiness assertions. The test also invokes
  the existing link preparation API before install and retains failed roots.
  Logs: `/tmp/relkit-s1-resume-contributor-peers-red.log`,
  `/tmp/relkit-s1-resume-contributor-peers-green.log`, and
  `/tmp/relkit-s1-resume-local-starters-focused-2.log`; earlier failed native roots
  and logs remain. This changes two packaged CLI implementation files, so b21
  remains an accepted intermediate snapshot, not the final source candidate.
  Final packing waits for the remaining implementation gates to settle. Gate
  continuation is `/tmp/relkit-s1-resume-remaining-gates-3/`.
- Continuation after the failed umbrella passes Inspector API and real MCP
  Inspector, then finds two generator acceptance fixture failures. The borrowed
  dependency links omitted Effect despite the starter's direct declaration;
  native snapshots also retained pre-Stage-1 start/import/dependency/patch output.
  The real missing-Effect case is reproduced with its full failed root retained,
  then passes after linking that declared dependency. Native snapshot generation
  updates all three variants; the complete diff is reviewed and its original
  bytes remain `/tmp/relkit-s1-resume-add-snapshot-before.snap`. A per-case outcome
  now permits fixture root deletion only after complete success, including across
  the five callers. Logs: `/tmp/relkit-s1-resume-generator-effect-red.log` and
  `/tmp/relkit-s1-resume-generator-add-green.log`. The original generator failure
  remains `/tmp/relkit-s1-resume-remaining-gates/03-test-generator.log`; remaining
  owning gates continue under `/tmp/relkit-s1-resume-remaining-gates-2/` before a
  final umbrella rerun. No product package or immutable b21 artifact changed.
- The resumed full gate passes build/no-diff, typecheck, execution test types,
  type fixtures, all package suites, unit/compiler/graph/contracts and integration,
  then stops at two native restart fixture failures. Raw failed umbrella:
  `/tmp/relkit-s1-resume-prepush-full.log`. Task 6.4's owning package/declaration
  gate is complete; the umbrella remains failed. One moved helper was omitted
  from the copy boundary, and a new Bun-only metadata producer was imported into
  Node. Intermediate Node resolver experiments and all flags are removed from
  final source. The Bun parent now writes the real validated package metadata;
  Node decodes every registration and SDK requirement before original native
  SQLite execution. No implementation/archive or native recovery assertion changed.
  The fixed restart suite passes 13 tests, one existing opt-in skip and 75
  assertions; the final preparation placement passes its focused seven-assertion
  native case. Logs: `/tmp/relkit-s1-resume-restart-final.log` and
  `/tmp/relkit-s1-resume-restart-agent-preparation.log`. Failed fixture roots now
  remain, with exact metadata equality, malformed-input and failed-scope controls.
  Earlier failed roots deleted by old unconditional cleanup cannot be restored;
  their logs remain, and the direct diagnostic root and later failed roots are
  retained. Focused failures remain in `/tmp/relkit-s1-resume-restart-worker-red.log`,
  `/tmp/relkit-s1-resume-restart-focused*.log` and
  `/tmp/relkit-s1-resume-restart-agent-focused-*.log`.
- The regular `bun run prepush` gate passes completely:
  `/tmp/relkit-s1-resume-prepush.log`. The fresh packed wrapper also passes all
  four pinned Bun/npm direct/wrapper flows, including own help/version, missing
  CLI behavior, creator-only archives and no-install creation parity:
  `/tmp/relkit-s1-resume-b21-wrapper.log`. The remaining full Docker/browser/
  scaffold/source acceptance is running in its existing owning command;
  historical failed full attempts are not treated as passes.
- Fresh b21 relocated production acceptance passes completely on the host and
  Docker, using the canonical emitted JavaScript command after production-only
  candidate installation and developer removal. Minimal HTTP output, selected
  Scalar/native worker assets, committed durable output 42, SQLite double
  migration and rollback, unchanged Drizzle repair, auth/session/signout/signin,
  and jobs beside auth all pass with zero-exit shutdown. Docker uses a 768 MiB,
  one-CPU builder and 512 MiB, one-CPU runtime; owned registry, containers,
  builder/image and successful temporary roots settle through existing cleanup.
  Log: `/tmp/relkit-s1-resume-b21-packed-production.log`; derived facts:
  [host](./stage-1-b21-packed-production.json) and
  [Docker](./stage-1-b21-packed-production-docker.json). Task 7.3 is complete;
  the complete owning source/deployment suites remain with the final gate.
- Fresh b21 packed native agents pass positive compilation and both negative
  misuse diagnostics with real selected SDKs, strict enabled and skipLibCheck
  disabled. Each LangChain/LangGraph/LangSmith SDK has one physical instance;
  genuine first-party peer-context copies remain explicitly counted. Retained
  report: `/tmp/relkit-stage1-b21-native-agents/report.json`. The existing runner
  retains successful stdout only, so the exact native behavior command was
  rerun in that same installed consumer to preserve complete stdout/stderr:
  `/tmp/relkit-s1-resume-b21-native-agents-complete.log` (eight cases, 36 assertions).
  The documented upstream exactOptionalPropertyTypes limitation remains limited
  to this selected native SDK profile; all 14 generic strict profiles keep it.
  Fresh Redis cache/realtime behavior and all 24 actual offline Pulumi mock
  resources also pass: `/tmp/relkit-stage1-b21-mixed-boundaries/report.json` and
  `/tmp/relkit-s1-resume-b21-mixed-boundaries.log`. No cloud provisioning ran.
- The original explicit-evidence matrix checker accepts all 84 installation
  samples, 28 generic profiles and 112 independent boundary observations against
  b21's exact manifest. Its generated report is
  [stage-1-b21-matrix.json](./stage-1-b21-matrix.json); command log:
  `/tmp/relkit-s1-resume-b21-final-matrix-2.log`. Measurements retain all observed
  accounting arithmetic and original failed attempts. The creator baseline is
  selected for explicit packed-artifact provenance. Missing historical manager
  layouts, the updated general-testing fixture and integration-langchain have
  null comparisons; no baseline functional pass or performance certification is
  inferred. A first metadata assembly omitted the absent LangChain historical
  key and wrote no input; its subsequent missing-input checker log remains at
  `/tmp/relkit-s1-resume-b21-final-matrix.log`. No measurement was rerun or altered
  for that correction. Final native/source acceptance is still pending.
- The fresh b21 generic matrix passes all seven fixtures under Bun normal,
  Bun isolated, npm and pnpm: 28 accepted profiles, 56 cold/warm samples and
  112 independently complete boundaries, each with its actual C3 exit and
  hash-preserving successful installation cleanup. Explicit accepted-row index:
  `/tmp/relkit-s1-b21-generic-accepted28.json`. All eight minimal/API profiles
  require exactly the same 33 individually reviewed CLI Inspector installation
  paths; the other 20 profiles require no exception. Raw resolved optional-peer
  edges and physical copies remain visible. Generic declarations, evaluation
  and emitted artifacts admit no UI, history or unselected SDK path. Selected
  consumer requirements are independently proven by the 14 strict consumers and
  the real isolated provider startup while the transitive provider is invisible
  at application root. Pinned runners are Bun 1.3.10, npm 11.19.0 and pnpm 11.9.0.
  The final S1.10 C2 rerun passes all 36 cases in three suites:
  `/tmp/relkit-s1-resume-s110-c2-final.log`. Tasks 2.4 and 10.1 are complete;
  selected-feature measurements and complete native/source gates remain open.
- Fresh b21 Bun creator, wrapper, minimal, API, production-only, generic-server
  client and general-testing rows pass all four boundaries and actual C3. Minimal/API admit only the
  33 explicitly reviewed CLI Next/React/history paths; production and server
  client need no exception. Together with the 14 strict consumers and selected
  native/source checks, this closes 4.1's generic/native ownership separation.
  The remaining package-manager rows and final source/native gates stay open.
  Accepted row receipts are under `/tmp/relkit-s1-b21-generic-matrix/`.
- Final consumer collection distinguishes resolved optional peers from installing
  ownership: every raw edge and physical package remains recorded, but a peer
  already supplied by an ordinary owner is not charged as another installer.
  Otherwise-unowned peers and all mandatory generic-client paths remain forbidden
  under the unchanged policy. Native alias/shared-parent/cycle/exhaustion controls
  pass. SDK-free graphs retain one connected witness for every observed file;
  any governed dependency retains complete package-route enumeration. The
  original 16,384-route ceiling is restored, with its exhaustion controls.
  Compact JSON retains every evidence field
  below the existing 64 MiB metadata limit; original indented reports remain.
- Production-only declaration collection now omits development-only Bun typings.
  Its regression first fails, then all 17 collector cases pass. The retained
  production install reproof passes with zero exceptions and unchanged package
  accounting: `/tmp/relkit-s1-resume-b21-production-reprobe.log` and
  `/tmp/relkit-s1-resume-b21-production-c3.log`. Failed observations, logs and
  complete pre-reprobe artifact snapshots remain preserved. Collector failure
  logs include `/tmp/relkit-s1-resume-peer-ownership-red.log` and
  `/tmp/relkit-s1-resume-production-typings-red.log`; current focused result:
  `/tmp/relkit-s1-resume-all-collector-fixes-green.log`.
- General testing's footprint fixture now supplies the genuine Bun 1.3.10 types
  required by its public native listener, using the packed starter's existing
  version. Its earlier fixture is not a comparable historical baseline. No
  candidate package API or dependency changed. Real CommonJS bundle collection
  excludes native virtual builtins from filesystem edges. VM collection admits
  TypeScript's measured 18.9-million-character source-map event within a finite
  32 MiB message bound; the 50,000-script and execution bounds remain. Source
  reconstruction checks both native import and require conditions against only
  VM-observed files, preserving the computed-import incompleteness control.
  Focused regressions first fail, then pass, with failed roots retained:
  `/tmp/relkit-s1-resume-builtin-bundle-red-full.log`,
  `/tmp/relkit-s1-resume-vm-map-red.log`,
  `/tmp/relkit-s1-resume-vm-conditional-red.log` and
  `/tmp/relkit-s1-resume-vm-conditional-green.log`.
  The original cold/warm pair is reused after preserving each prior probe tree;
  all four final boundaries and actual C3 pass without exceptions:
  `/tmp/relkit-s1-b21-generic-matrix/bun-general-testing-native-final/raw.json.candidate-row.json`.
- B21 strict consumer acceptance passes all seven profiles in each Bun layout
  (14 profiles, 24 native compiler outcomes). Backend auth, selected auth bridge,
  generic testing, SQLite, generic server client, query and React bindings retain
  their actual declarations and misuse checks. Reports:
  `/tmp/relkit-stage1-b21-strict-isolated/report.json` and
  `/tmp/relkit-stage1-b21-strict-normal/report.json`; logs:
  `/tmp/relkit-s1-resume-b21-strict-isolated.log` and
  `/tmp/relkit-s1-resume-b21-strict-normal.log`. Public type fixtures and S1.10 C2's
  exact three suites also pass (36 cases):
  `/tmp/relkit-s1-resume-type-fixtures.log` and
  `/tmp/relkit-s1-resume-s110-c2.log`. Tasks 6.1–6.3 are complete; 6.4's complete
  owning package-suite result remains with the final source gate.
- Fresh b21 build passes all 61 tasks with zero cached tasks in 287.664 seconds.
  Packing passes for 55 archives; manifest SHA-256:
  `2eb07912b532e43c9be511af38747b838ec3aedc6678099f654d6aece20b0246`.
  Changed archives are app, compiler, CLI, testing and LangChain. The real packed
  isolated selected-local startup is GREEN while provider is invisible at the
  project root; retained report: `/tmp/relkit-stage1-b21-provider-isolation/report.json`.
  Logs: `/tmp/relkit-s1-resume-build-b21.log`,
  `/tmp/relkit-s1-resume-pack-b21.log`,
  `/tmp/relkit-s1-resume-b21-provider-isolation.log`.
- The first b21 minimal-development consumer stopped at the containment guard:
  TypeScript's default compiler-host current directory selected workspace Node
  and undici ambient declarations. The same retained installation with a
  consumer-rooted host has zero external declaration files and zero diagnostics.
  The collector now sets that host directory explicitly; strict flags and escape
  rejection remain. The ambient-resolution regression fails before the fix and
  five collector cases pass afterward. Logs:
  `/tmp/relkit-s1-resume-declaration-context-red.log` and
  `/tmp/relkit-s1-resume-declaration-context-green.log`. Original failed root and
  raw measurement remain under `/tmp/relkit-s1-b21-generic-matrix/bun-minimal-development`.
  Fresh `context2` rows use the corrected collector; no repacking is required
  because no candidate package source changed.
- Resumed Stage 1 in the existing checkout. S1.2 metadata, dependency policy and
  authoritative producers (2.1–2.3) are recorded complete: the exact owning
  contracts/compiler/engine cohort passed 28 tests and catalog/release/runtime
  plan tests passed nine cases. Rechecked all 236 source/configuration identities
  and 166 generated template/patch identities against the retained repeated
  producer checkpoint; every hash matches. Logs:
  `/tmp/relkit-s1-resume-requirements-focused-2.log` and
  `/tmp/relkit-s1-resume-requirements-producers.log`. Package-manager matrix
  task 2.4 remains open for its actual final consumer runs.
- Native todo descriptors now pass the minimal structural/runtime/testing and
  empty-subagent assignment check and the complete integration test typecheck.
  The retained state-key implementation needed no further redesign. Corrected
  its new regression to use native LangGraph middleware state and structural
  inference assertions for RELKIT intersection schemas; preserved private-key,
  stateless, erased-array and negative inference checks. Six focused native
  tests pass; commerce/helper source compilation passes after rebuilding the
  single public native export realm. Its no-emit fixture explicitly disables
  inherited declaration generation, matching the owning test configuration.
  Logs: `/tmp/relkit-s1-resume-native-types-2.log`,
  `/tmp/relkit-s1-resume-native-focused.log`, and
  `/tmp/relkit-s1-resume-commerce-types-2.log`.
- S1.3's generated startup fixture now supplies the actual app facade instead of
  an obsolete project-root provider link. Both missing-selected-SDK and original
  nested-initialization-failure cases pass after the retained RED in
  `/tmp/relkit-s1-resume-requirements-focused.log`. No application dependency or
  implementation was added for this fixture correction.
- Reconciled S1.3's static preflight/resolution/phase/startup/diagnostic tasks,
  S1.4's selected native and shared-state ownership, all four S1.5 HTTP tasks,
  S1.7's lifecycle and preparation-identity tasks, all three S1.8 store tasks,
  and S1.9's creator/wrapper/catalog tasks against retained unchanged EOF reviews
  and their owning checks. The combined HTTP/lifecycle/history/creator cohort
  passed 61 cases in 14 files; collector and Inspector API tests passed 15 cases
  in six files. Logs: `/tmp/relkit-s1-resume-owning-focused.log` and
  `/tmp/relkit-s1-resume-history-inspector.log`. The remaining packed-consumer,
  strict declaration, production and complete-source acceptance stays open.
- S1.4's maintained native callers and tutorial migration (4.4) pass their
  acceptance: 83 contract cases and 63 integration cases pass; three opt-in
  Docker cases remain assigned to the explicit Docker gates. The executable
  Orders tutorial passes both migration stages, check/typecheck/test/build,
  authenticated production HTTP and restart. Logs:
  `/tmp/relkit-s1-resume-contracts.log`, `/tmp/relkit-s1-resume-integration.log`,
  and `/tmp/relkit-s1-resume-docs-tutorial.log`. The earlier combined command
  without `./` roots matched unassembled templates and is retained as a command
  failure in `/tmp/relkit-s1-resume-contracts-integration.log`; no product repair
  or passing claim is based on that invocation.
- Fresh b20 native agent acceptance passed strict public compilation with
  `skipLibCheck:false`, exactly two expected misuse diagnostics, eight runtime
  scenarios with 36 assertions, and ten actual SDK identity comparisons.
  All 10,904 files in 32 installed first-party copies matched 29 candidate
  archives. Its 1,487 loaded declaration paths were contained in the consumer;
  DeepAgents and native Redis SDKs were absent. The standard native profile's
  extra exact-optional limitation remains documented below. A separate fresh
  producer replay also passed after a fixture-only size refactor, preserving
  all eight source/config copies and exact report/return contracts.
- Fresh b20 packed production acceptance passed all relocated native and Docker
  checks again, including auth migration/rollback/repair, auth session lifecycle,
  durable output `42`, readiness and shutdown. Exact builder/image/container
  cleanup passed. The candidate-bound result is retained in
  [stage-1-b20-packed-production.json](./stage-1-b20-packed-production.json).
- The b19 mixed Redis and offline AWS/Pulumi results transfer to b20 through
  exact verified identities for all 31 consumed first-party archives. All 272
  retained installed manifests, 33 source/lock/probe/config/report entries and
  source/log pins were checked unchanged. Neither changed archive, CLI or
  LangChain, occurs in these physical closures. This is b19 execution with
  verified b20 inputs, not a new native execution.
- b20 built all 61 tasks in 348.507 seconds and packed 55 archives totaling
  12,065,880 compressed bytes. Its immutable manifest SHA-256 is
  `ab2cd5a83884ffb916a830c82396fc2649213b295c5ca097d43769ebd73fce2e`.
  All actual SHA-256, SHA-512 and integrity values were independently checked.
  Only LangChain and CLI archives changed from b19, so CLI-consuming acceptance
  requires fresh execution. Ten sampled build processes were absent afterward.
- The fourth b19 packed production attempt passed canonical relocated JavaScript
  startup, readiness and shutdown for minimal, selected-native and auth/jobs
  applications. Real auth migration/rollback/repair and signup/session/signout/
  signin passed; the same auth server and real Docker image completed durable
  output `42`. Native Docker checks observed builder memory 768 MiB, runtime
  memory 512 MiB and one CPU each. Exact builder/image/container and temporary
  root cleanup passed. Logs and structured results remain in
  `/tmp/relkit-s1-b19-packed-production-4-summary.json`. b20 replay is pending.
- b19 built all 61 tasks and packed 55 archives totaling 12,070,056 compressed
  bytes. Its immutable manifest SHA-256 is
  `fa3fd9f1f4309ef1486198a54be071ed6bae8d72b80017ed1025f403fe47f48b`.
  The compiler/CLI fixes changed only those two archives from b18. A later
  LangChain declaration isolation fix requires a fresh b20 candidate.
- The b19 packed mixed Redis proof passed real cache operations, cross-client
  wake, replay, idempotence and single-module selection. A no-commit control
  failed at its independent three-second deadline. The packed AWS/Pulumi
  offline mock proof registered 24 unique resources without cloud mutation.
  Both public declaration checks used consumer-owned native type libraries,
  `strict:true` and `skipLibCheck:false`. Details and exact logs remain in
  `/tmp/relkit-s1-packed-mixed-validation-summary.json`.
- Eight native agent runtime scenarios and ten SDK identity comparisons passed
  against b19. Full declaration checking exposed four unselected DeepAgents
  resolution errors and 20 upstream SDK errors under the additional
  `exactOptionalPropertyTypes:true` option. A direct SDK-only control reproduced
  all 20 upstream errors without loading any RELKIT declarations; the same
  control passed standard `strict:true`, `skipLibCheck:false` with that extra
  option disabled. The first-party isolation fix and fresh packed proof remain
  pending. The repository and fourteen generic strict profiles keep their
  stronger existing option.
- The first three complete-source verification attempts failed; none supplies
  full browser/container acceptance. Their discovered stale fixtures have
  focused passing regressions, but a final full invocation remains required.
  Three packed production attempts also failed in fixture preparation, before
  completing production runtime acceptance. Their roots and logs are retained.
- The final mixed-test container and its captured volume were removed. An
  earlier possible anonymous-volume residue could not be linked conclusively
  to its removed container. Read-only recovery found an empty volume and no
  fixture markers; it was retained rather than deleted without ownership proof.

Historical checkpoint (2026-10-21):

- The complete workspace build passed 61/61 tasks in 200.884 seconds, with 57
  cached tasks: `/tmp/relkit-s1-build-18.log`. Its 11 sampled owned processes
  were absent afterward. Build 17 was interrupted after a missing docs-specific
  concurrency setting launched six compilers; build 18 explicitly used
  `RELKIT_DOCGEN_CONCURRENCY=1` and verified one active docs compiler.
- `bun run prepush` passed in `/tmp/relkit-s1-prepush-final-5.log`: 55 package
  typechecks, type fixtures, 427 test cases and zero failures. Five Linux-only
  watcher cases were correctly skipped on this macOS host. This rerun includes
  the final export-fixture, browser-lifecycle and collector changes. Full
  verification/browser/container acceptance remains separate and pending.
- The preceding prepush exposed a real eager compiler import in Ready-link
  presentation. Its native emitted-ESM trace and repeated RED test are retained.
  A validated presentation-only UI projection keeps the compiler type-only;
  the original packaged-import guard and three Ready cases then passed. This
  changes CLI bytes. The fresh b18 candidate contains 55 authoritative archives
  totaling 12,067,745 compressed bytes;
  packing passed in `/tmp/relkit-s1-pack-b18.log`. Its manifest SHA-256 is
  `316773589b84cad655c60636fdf1ec5a1a51ebd8d573fbe58f1810f58af2f3f8`.
  b17 remains historical; evidence is not transferred without exact archive
  identity checks.
- b17 passed seven strict consumers in each Bun layout: 24 compiler outcomes
  and four real public-import runtime smokes in total. Isolated report SHA-256:
  `d68dcef6bc36e27a4e096a7790b264ec54f2ae79e075cf1d666e3f7d4328485f`;
  hoisted: `30c693635e0baa4341d731ace33be09c5c65a6956f53abb00edee73b2e57fe16`.
  Both successful install/cache cohorts were removed only after all 48 retained
  evidence-file hashes per cohort were checked unchanged. The new
  [input-equivalence report](./stage-1-b18-strict-input-equivalence.json) rechecks
  those preserved hashes and independently verifies SHA-256/SHA-512/integrity
  for all 32 consumed archives: 31 installed owners plus creator catalog/repair
  authority. Every consumed archive is byte-identical in b18. Only CLI and
  deploy-pulumi changed, and neither occurs in those installed closures. This
  remains b17 execution with verified b18 input equivalence, not a b18 rerun or
  an invented installed-file integrity proof.
- Native Playwright ownership/selection/source preservation passed 7/7 cases,
  with 29 assertions, in `/tmp/relkit-s1-browser-source-lifetime-1.log`. Strict
  checking of 24 roots/2,461 files had zero diagnostics. Both Next-written
  source files restore only after owned children join, with final generated
  bytes retained. All 11 original Inspector scenario call sequences remain
  intact. Actual browser suites are still pending.
- The exact three-file S1.10 C2 Vitest cohort passed all 36 tests after the
  collector correction in 32.44 seconds:
  `/tmp/relkit-s1-final-c2-3files-2.log`.
- b18 native history ownership passed all four tests in 17.70 seconds:
  `/tmp/relkit-s1-b18-storage-ownership.log`. Fresh cursor 1, retained cursor 41,
  append cursor 42 and reopen were verified without changing existing schema,
  import receipt or source bytes. All three worker PIDs were absent afterward;
  `/tmp/relkit-s1-b18-storage-cleanup.json` retains that check.
- The b18 native-agent composite gate passed eight real SDK scenarios with 36
  assertions and ten SDK reference-identity checks. Its earlier compilation
  used `skipLibCheck:true`, so it does not establish public SDK declaration
  validity; the stronger b19 check and its failures are recorded above. The
  unchanged retained installation has singleton native SDKs and two legitimate,
  byte-identical first-party peer contexts; every copy was checked against its
  exact candidate archive. `/tmp/relkit-stage1-b18-native-agents/report.json`
  retains the actual results and earlier fixture-policy failures separately.
- The first b18 creator cold/warm pair installs ten physical package instances,
  with 9,309,407 archive bytes, 51,140,055 logical bytes, 59,551,744 allocated
  physical bytes and no native files. All four boundaries subsequently passed
  on that same installation after the namespace-export/standard-library
  collector correction. Raw observations have no exceptions. The original
  incomplete report remains unchanged. Reprobing reused the original successful
  bundle/metafile output names: those standalone original bytes were overwritten
  and cannot be claimed preserved. The original failure report, declaration
  diagnostics and nonce VM journal remain intact; future same-root reprobes
  must snapshot the complete existing probe directory before any writes.
- The native export fixture now uses actual isolated installations and verified
  Drizzle repair bytes. All 12 SDK-free authoring roots and all 13 selected
  integration public-entry sets passed. The combined resolver passed in
  `/tmp/relkit-s1-exports-combined-native-green-2.log`: shared public entries
  execute in Node; Bun-specific leaves and the Bun-engine creator execute in
  Bun; native export resolution and private-path rejection remain checked.
  Three focused packed regressions passed seven assertions; the final expanded
  strict check also passed. The preceding full Phase 0 result remains 27 passes
  and one failure, retained in `/tmp/relkit-s1-phase0-final-3.log`. The complete
  rerun passed all 28 cases and 170 assertions in 445 seconds, with zero
  failures: `/tmp/relkit-s1-phase0-final-4.log`. All sampled owned PIDs were
  absent afterward; the normal scoped native owners joined their children.

The [source review ledger](./stage-1-source-reviews.json) binds actual EOF reviews
to source hashes, separately from execution results. The last frozen checkpoint
covered 1,217 reviewed files plus one generated exemption, with zero review gaps
or authored size/function-limit violations. Further source edits require a new
ledger checkpoint. No Stage 1 completion or Stage 2 admission is claimed.

The [baseline recollection](./baseline-recollection-20261021.json) now contains
four successful cold/warm samples from the original 53-archive cohort. Package
name/version instance identities, compressed bytes, logical bytes and physical
bytes exactly match both historical fixtures. Creator: 18 instances,
14,554,330 archive bytes, 79,525,134 logical bytes and 95,551,488 physical bytes.
Server client: 32 instances, 10,998,014 archive bytes, 60,734,255 logical bytes
and 74,510,336 physical bytes. The updated collector did not change either
baseline's accounting. This proves comparison reproducibility, not a Stage 1
functional or performance verdict.

The first recollection attempt was stopped with zero samples after a parent-wide
`BUN_CONFIG_MAX_HTTP_REQUESTS=1` deadlocked the nested registry proxy. A bounded
native three-server reproduction failed with that setting and succeeded without
it. The repeated measurement omitted that parent setting while retaining the
installer's supported `--network-concurrency=1` and `--concurrent-scripts=1`.
Both original failure and successful reports remain unmodified in the new index.

## Scope and source identity

Implementation resumed on 2026-10-21 in the requested checkout, initially at
`3ee9e7b6393951ec12ed310233a7d93d24aefba4` on `main`. The only pre-existing dirty
path was this untracked OpenSpec proposal. No commit, push, publication, cloud
operation or user-data deletion is authorized or claimed. Existing migrations
and the Drizzle repair remain preserved.

The refreshed [ownership inventory](./stage-1-inventory-final.json) resolves all 347
third-party edges across 68 manifests: 192 development, 129 runtime, 25
optional peer edges and one required peer. It identifies 85 edges exposed by declarations and leaves
no unresolved catalog/workspace version or empty final owner. This inventory
contains no installation samples and does not itself pass an isolation gate.

The later supplied AGENTS instructions require resource checks, one heavy task
at a time, supported worker limits and cleanup. They supersede the earlier
request to ignore resource limitations. The machine has 10 logical CPUs and
16 GiB memory. Failed runs and diagnostic evidence remain retained.
An actual admission attempt subsequently deferred at warning pressure with zero
install samples; [its report](./stage-1-bun-admission-20261021.json) remains a
failed gate. The user then explicitly authorized proceeding through memory
warnings. Subsequent checks retain one heavy task, supported limits and resource
observations; this authorization does not turn the earlier deferral into a pass.

The final preparation frozen install checked 1,477 installs across 1,575 packages
and reported no changes. Repeated release synchronization preserved all 236
captured source/configuration identities. Regenerating packed templates again
reproduced all 166 template/patch file identities; the generated Drizzle patch
matches the source SHA-256 recorded below. These checks do not replace fresh
installation or four-boundary acceptance.

## Implemented boundaries

- Existing integration metadata declares selected dependency requirements;
  compiler, CLI and engine share preflight and importer-contained resolution.
  Node global search directories cannot supply an application's missing SDK.
  Empty or unused requirements do not require an unrelated package manager.
- Native LangChain execution belongs to `@relkit/langchain`; generic agent
  contracts no longer own its SDK implementation. Explicit transports, API docs,
  frontend clients, Better Auth and Drizzle leaves preserve selected behavior.
- Generic client and testing entrypoints have independent declaration paths.
  Server hydration retains the registered application contract, including query
  function output inference.
- Runtime lifecycle is below CLI. Production preflight resolves from the
  executable module directory, matching relocated native import ancestry.
- Core observability uses bounded in-memory storage; explicit local history
  belongs to `@relkit/observability-local`. Only measured CLI inspector paths
  can receive temporary Stage 1 admissions.
- Creator and wrapper bootstrap avoid compiler-backed existing-project editing;
  that work belongs to CLI. The catalog supplies metadata, and selected starters
  retain the exact Drizzle repair and existing application contracts.

## Verified focused evidence

These are local source checks, not fresh packed acceptance or a complete gate.

| Boundary                             | Observed result                                                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Contracts and independent collectors | Latest combined runs: 83 contract cases and 9 collector/producer cases passed                                            |
| Native agents                        | Earlier full native cohort: 192 cases; affected strict projects passed after tuple/Zod inference repair                  |
| Creator and scaffolding              | 87 established behavior cases passed; actual creator certification passed 20 fresh and 20 restart starts                 |
| Authoring exports                    | 24 metadata/compiler/producer cases, compiler typecheck and maintained data-model CLI check passed                       |
| Provider resolver                    | 22 manager cases and 19 Node/importer/optional-transport cases passed                                                    |
| Lifecycle                            | 28 cases passed after ownership moved to engine                                                                          |
| Provider state                       | 18 cases and strict source/test compilation passed; 79 assertion expressions retained                                    |
| Relocated preflight                  | RED reproduced the wrong root; 8 cases and compiler typecheck passed after the fix                                       |
| Selected source production           | Scalar, durable result `42`, health and SIGTERM passed; packed/Docker proof pending                                      |
| HTTP                                 | Full run: 160 passed, one failed, one skipped; sole test fake corrected, owning 8 cases passed; final full rerun pending |
| Doctor                               | 10 cases passed, including a reproduced creator-version mismatch regression                                              |
| Documentation                        | Full API generation, extracted examples and full site production build passed                                            |
| Workspace build                      | 61 of 61 tasks passed in `/tmp/relkit-s1-build-13.log`                                                                   |
| Boundaries                           | Latest `bun run check` passed: 64 roots and 5,375 TypeScript files                                                       |

Final source review reproduced two compatibility gaps. Snapshot eligibility
still rejected the new native owner; the corrected exact factory policy passed
6 cases after the original suite failed. Dependency range validation treated
`x` inside prerelease/build identifiers as a wildcard. All four new positive
cases first failed, then the affected four-suite cohort passed 39 cases. The
final contract suite passed 22 cases, including compound wildcard-core rejection.

The source audit covers more than 1,150 changed source/test files; final source
fixes are being reconciled before the next candidate build. The latest boundary
scan passed 64 roots and 5,405 TypeScript files. Public authoring lint and
Konsistent configuration validation passed as well.

## Retained failures and current gates

Build logs `/tmp/relkit-s1-build-1.log` through
`/tmp/relkit-s1-build-10.log` retain original failures and interruptions.
Implementation failures found during builds were fixed with focused checks.
The complete workspace build subsequently **passed all 61 tasks**, including the
refreshed candidate in `/tmp/relkit-s1-build-13.log`. Build 12 was intentionally
stopped for the two final compatibility repairs described above. Docs generation
runs one package at a time. Next builds use one Webpack compilation worker and
the docs production compiler disables its unbounded in-memory filesystem cache.
The passing build used a 2 GiB Node heap limit and lower scheduling priority.

The first actual creator certification failed before measured starts. Its
partial packing closure omitted development workspace owners needed by the
staging lockfile. `/tmp/relkit-s1-create-certification-1.log` retains the failure;
the transactional producer restored the prior capability source. The packing
closure and explicit internal export maps were corrected without weakening the
listing checker. The final transactional run passed in
`/tmp/relkit-s1-create-certification-4.log`; actual reports are retained in
`../create-capabilities/0.7.11/lean-stage-1-2026-10-21/`.

Fresh starts: 20/20, median 461.88 ms, p95 475.09 ms, maximum 480.44 ms.
Restart starts: 20/20, median 459.27 ms, p95 485.22 ms, maximum 487.97 ms.
Both functional readiness and the strict one-second performance verdict passed.
The producer rebuilds CLI between cohorts; their recorded CLI hashes differ.
Later packed acceptance uses one full immutable directory rather than claiming
all certification samples used byte-identical CLI tarballs.

After build 13 and the bounded CLI readiness-link repair/build, all 55 release packages were packed into
`/tmp/relkit-stage1-candidate-20261021-b14/artifacts`. The manifest records each independent
version, SHA-256/SHA-512 and integrity. Packing verified exact dependency metadata,
public export targets and license bytes; it performed no publication.
The complete manifest SHA-256 is
`f9a6f1510b4f28de42ba306084e138d90b07c027bd647f0fd1bdbf40fb6abcd7`.
The 55 compressed archives total 12,061,548 bytes. Only the CLI archive changed
from build 13 (828 compressed bytes); all other archive hashes are identical.
Earlier candidate directories remain retained separately.

The packed wrapper passed actual Bun 1.3.10 and npm 11.19.0 execution through
native package runners: wrapper/creator four-way exact-version offline
`--no-install` creation produced identical selected files, installed no CLI,
and retained own help/version plus missing-project-CLI/no-mutation behavior.
`/tmp/relkit-s1-final-wrapper-proof-4.log` records the pass. Failed attempts
remain separate. Bun's `@latest` alias is verified against the controlled
registry; its native offline latest-tag cache lookup failed and is not claimed
to work. The exact-version offline requirements remain unchanged.

The installed build-13 CLI passed external create/prepare, independent pins,
REST/RPC/OpenAPI, actual inspector, pointer identity/recovery, and the manual
no-install/install/check/type/test/build/production sequence. Its actual default
Reference 404 exposed a stale test expectation and an incorrect Ready link.
The expectation now matches OpenAPI-only defaults; the product projects Reference
only from an activated manifest selecting Scalar. That repair passed its original
RED case, 3 focused cases, 6 existing lifecycle cases and CLI compilation.
The exact changed build-14 CLI still requires packed reproof.

The first strict isolated build-14 consumer attempts retained every original
failure. Two profiles and three compiler outcomes passed before general testing
reported TS2307 from oRPC's native declarations: `@orpc/shared` imports
`@opentelemetry/api` unconditionally despite declaring it an optional peer.
The transport owners are being corrected against installed API version 1.9.1;
this lightweight API is allowed by the core policy. No SDK stub, declaration
suppression or missing-dependency exemption is used.

Harness repairs independently passed six regression cases with 21 assertions:
canonical `/private/tmp` containment, preservation of native compiler failures
without counting repeated stack renderings, and real installed package lookup
when Bun resolves `ws` as a builtin alias. The actual installed `ws` bytes and
outside-root symlink rejection were both checked. The strict compiler's Node
heap was raised from 768 MiB to 1536 MiB after a retained bridge OOM; six samples
in the later bridge run recorded a peak RSS of 861 MiB. These repairs do not
constitute the remaining four profiles or either runtime smoke.

The repair declares a required API peer plus development copy on the public
client, and ordinary API dependencies on Hono and the private inspector. This
keeps the separately installed query SDK's package-manager peer context visible.
Three metadata/native-declaration regressions passed with 22 assertions; actual
fresh package-manager consumer proof remains authoritative. Lockfile install,
release synchronization and template production passed, followed by all 61 tasks
in `/tmp/relkit-s1-build-15.log`.

The new immutable candidate is
`/tmp/relkit-stage1-candidate-20261021-b15/artifacts`: 55 archives totaling
12,061,516 compressed bytes. Manifest SHA-256:
`b74d9ee226097778565e864846b00097f8d9f5deca08fb5615f07f250c3fdf02`.
Only client, Hono and CLI archive hashes differ from build 14. All old candidates
and failed strict-consumer roots remain retained.

After the remaining product cleanup/service repairs, the final workspace build
passed all 61 tasks from scratch again in 345 seconds, with zero cached tasks:
`/tmp/relkit-s1-build-16.log`. All sampled owned build PIDs were absent afterward.
This build is the source for the next immutable candidate; no earlier candidate's
consumer result is silently attributed to the repaired bytes.

The first broad package run reached 2,887 passing Vitest cases, five skipped
cases and one failing terminology guard (after earlier runner/type-probe groups
passed). The guard identified a misleading new scaffold comment and three
unchanged historical evaluation JSON files. The comment was corrected; archived
JSON observations remain preserved, with executable files still checked. All
five focused guard cases then passed. The full umbrella remains failed until
its complete rerun; the later Bun groups did not run in that failed attempt.

RedisStore 1.0.11 already failed the pinned native BaseStore type contract at
HEAD. It lacks lifecycle declarations and has incompatible batch/put shapes.
The docs now describe this inherited limitation instead of claiming strict
memory-store compatibility. Redis checkpoint-saver claims are unchanged.
Prototype checks do not prove full store compatibility; no cast, fabricated
lifecycle method or dependency downgrade is used as proof.

## Historical acceptance notes

Candidate 15 passed all seven strict isolated consumer profiles: twelve native
compiler outcomes and two actual public-import runtime smokes. Required imports
resolved without fixture API stubs or `skipLibCheck`; negative programs retained
their native diagnostics. The report is
`/tmp/relkit-stage1-b15-strict-isolated/report.json`, SHA-256
`be4f01f659833d476604b525d4555f28c3bd51b6b2b7c9be8eb811268b3d5a92`.
Its successful installation trees were cleaned after 48 retained evidence-file
hashes were checked unchanged.

Later disk recovery archived the five failed strict installation/cache trees
losslessly, without removing their source/configuration/locks/compiler reports.
All 250,447 archived entries were checked against file hashes, modes and link
targets before releasing those installation trees; all 66 non-install evidence
files retained their original hashes. The five archives total 487,520,234 bytes.
Recovery commands and archive SHA-256 values are recorded in
`/tmp/relkit-s1-failed-install-archive-result.json`; the archives and per-entry
inventories remain in `/tmp/relkit-stage1-retained-install-archives/`.

The exact candidate also passed all four store-ownership cases, including fresh
cursor 1, preserved history 41, append/reopen 42 and joined native-worker cleanup.
The first production acceptance passed minimal and selected native relocation
stages, then exposed an omitted authoring-only workers-types fixture dependency.
That fixture now takes the verified packed catalog pin. Its rerun was stopped
at the existing disk floor; no Docker objects were created. Both failed roots and
logs remain evidence. Neither attempt is a full production acceptance pass.

Further source review repaired creator output advertising an unselected API
reference, a generator ancestor-symlink escape, and lost provider-release causes
when application acquisition fails. These changes require a fresh final candidate.
The four-boundary policy now also rejects unselected cloud, Redis, job, database
and telemetry SDKs; eleven new cases first failed, then the combined policy and
independent-boundary suites passed 26 cases. The lightweight telemetry API remains
allowed.

Final-candidate strict consumer reproof, selected native execution, relocated
production and bounded real Docker checks remain pending.
Cold/warm installation measurements and independent installation, evaluation,
declaration and bundle evidence must use those exact tarballs across the required
package-manager layouts. Only manually reviewed exact CLI inspector paths may
become temporary exceptions. Raw observations remain unchanged; the final-stage
policy must reject those same paths.

The required repository command sequence, browser/container/scaffolding gates,
producer idempotence, per-file reviews, source/candidate hashes and process
cleanup must be reconciled before Stage 1 can close. Local checks do not establish
hosted CI, publication or registry-consumer certification.

Drizzle patch SHA-256:
`10ea188b9409dd19aac7bf27f4b12911ae4844c063362b9c2bd11d6a3d936374`.

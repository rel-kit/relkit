## 1. Baseline, ownership contract, and worktree preparation

- [x] 1.1 Refresh all authored TypeScript inventory across the three package roots, including hidden/ignored files and root tests/config; read every file through EOF and record exclusions and reviewed dispositions against the initial 18-file inventory in design.md. Verify no authored file is omitted and inspect overlapping dirty changes in both repositories.
- [x] 1.2 Load applicable AGENTS, use-effect, Effect branch references, TSDoc and konsistent guidance; verify selected APIs against available vendor implementation/tests/examples and installed `4.0.0-rc.115`. Record absent vendor evidence and resolve remaining API uncertainty from version-matched sources before using it; verify pins remain unchanged.
- [x] 1.3 Inspect worktree attachments and current source revision, then create/reuse one isolated implementation worktree as authorized. Record its path/revision and planning-artifact access, verify relevant current changes are represented, and leave the original checkout/index untouched.
- [x] 1.4 Establish focused baseline results for Drizzle activation, Better Auth service tests, database model integration/example/migration tests, domain-services type fixtures and application-service isolation; record exact commands, counts and pre-existing failures before implementation.
- [x] 1.5 Characterize and document the shared Drizzle/Auth activation contract: lazy construction, first environment, shared versus isolated acquisition, failure reset, idempotent close without implicit cache eviction, borrowed DB ownership, shared-client SQLite coordination and public errors. Verify characterization tests capture each observable invariant.
- [x] 1.6 Define the internal service/layer seam and compatibility adapter ownership; give disjoint Drizzle/Auth package roots to two workers only after it is stable, with shared manifests/lockfile/runtime consumers owned by the integrator. Verify a recorded dependency/order plan and fall back to sequential dependent work if coordination erases time savings.
- [x] 1.7 End phase 1 with an independent reviewer using use-effect and Effect guidance to read every changed TypeScript file, including characterization tests and shared contracts. Record reviewed paths, fix findings, and rerun invalidated baseline/type checks before accepting the seam.

## 2. Drizzle runtime services and compatibility

- [x] 2.1 Add the existing pinned Effect dependency where required and introduce cohesive activation/database service contracts and live Layers under `packages/drizzle/src/`, with deterministic test Layers under `packages/drizzle/tests/`; verify live/test substitution exercises the same contract without hidden client acquisition and package build/typecheck resolves imports.
- [x] 2.2 Implement scoped client acquisition, shared/isolated state and idempotent cleanup with typed acquisition failures; verify concurrent acquisition, failure reset, first-environment semantics, partial acquisition, individual waiter interruption, close concurrency and no accidental shared-instance reopening.
- [x] 2.3 Replace SQLite Promise-tail coordination with safe client-identity coordination and cover begin/callback/commit/rollback failures. Verify a failed BEGIN cannot block a later transaction, two descriptors sharing one client cannot overlap transactions, and primary plus cleanup failures remain diagnosable.
- [x] 2.4 Implement driver-aware cancellation and transaction/resource finalization; verify waiting cancellation, supported abort propagation, uncancellable in-flight completion before permit release/rollback/close, exactly-once release, and no automatic retry of non-idempotent writes.
- [x] 2.5 Compose CRUD/model/transaction operations as named Effect workflows with thin compatibility edges, appropriate traversal and bound concurrency only for independent work. Verify selector/pagination/dialect behavior, override `base`, sync/async extension inference, transaction-bound models and nested-transaction rejection with existing and focused tests.
- [x] 2.6 Add useful Effect schema/type companions at real data boundaries while preserving public `zodSchemas`; verify select/insert/update parity for null/default/generated/optional fields, overrides and actual rows, plus unchanged public type fixtures and expected validation behavior.
- [x] 2.7 Implement shared standalone instrumentation using existing tracing/logger wiring. Verify outcomes/durations/work counts, visible configured logs, bounded metrics, success/failure/defect/interruption, redaction, preserved causes and no duplicate adapter accounting; verify local child log-level isolation if children are used.
- [x] 2.8 Complete documentation, checked composition examples, type extraction and declaration spacing across all 13 original Drizzle files and new companions/tests; verify each inventory disposition, public/internal re-exports, no cycles, changed-file formatting and the 250-line implementation limit.
- [x] 2.9 End phase 2 with an independent use-effect reviewer reading every changed TypeScript file through EOF, including supporting files outside Drizzle, and inspecting applicable capability choices, driver cleanup, loops/fibers, observability and documentation. Resolve findings, rereview fixes, and pass focused package/integration/type/example checks before Drizzle integration is accepted.

## 3. Better Auth runtime services and React boundary

- [x] 3.1 Implement the auth service/live Layer and deterministic fake factory/test Layer against the reviewed Drizzle seam, adding only existing pinned dependencies. Verify native options/session inference, sole database/dialect/schema selection and route-derived base path while compilation remains free of acquisition.
- [x] 3.2 Replace mutable Promise lifecycle logic with explicit Effect-owned acquisition and failure reset. Verify concurrent shared reuse, isolated distinct instances, failed activation retry, descriptor handler identity, inactive 503, and that auth neither replaces shared state during isolated acquisition nor disposes the borrowed DB.
- [x] 3.3 Implement observable handler/session workflows and truthful SDK failure/cancellation boundaries; verify input/configuration rejection, Request signal behavior where supported, failure/defect/interruption preservation, standalone logs/metrics/redaction and no premature DB shutdown during admitted auth work.
- [x] 3.4 Review and organize all four original Auth TypeScript files, moving refactored root tests into owner-root `tests/` and named types into useful companions. Preserve React hooks and identity behavior; verify pending/anonymous/authenticated/session-change remount cases, browser subpath safety, TSDoc examples, formatting and file-size limits.
- [x] 3.5 Integrate Drizzle/Auth and update only necessary CLI/testing/runtime consumers under the integrator's ownership; verify application-service isolation, compiler session inference, generated database/auth templates, auth route/protection ordering and API compatibility across supported dialects.
- [x] 3.6 End phase 3 with an independent use-effect reviewer reading every changed TypeScript file through EOF, including React/tests/shared consumers. Resolve findings and rereview fixes; pass affected auth, database/auth integration, type, generator and browser-boundary checks before accepting the phase.

## 4. Standard provider purpose and compatibility

- [x] 4.1 Refresh the `providers-standard` audit across authored source, runtime imports, release/catalog/project references, guardrails and migration history; verify whether the recorded zero-runtime-consumer finding still holds and record the evidence-backed compatibility-only retention decision.
- [x] 4.2 Document the empty compatibility package accurately using appropriate package metadata/documentation without adding artificial Effect runtime features or removing the package. Verify the empty public export, package build/pack surface and existing negative import/boundary guards; do not hand-edit stale generated output.
- [x] 4.3 End phase 4 with an independent use-effect reviewer inspecting the sole authored entrypoint and every TypeScript file changed by this phase. Record unchanged-file justification when applicable, resolve findings and verify affected package/release/boundary checks before phase acceptance.

## 5. Combined framework verification and review

- [x] 5.1 Reconcile all package inventories and new/moved/supporting TypeScript files against accepted phase reviews; verify full coverage and meaningful dispositions for pure leaves, types, React and the empty provider entrypoint. Revisit all 25 capability families for actual applicability without creating unrelated features.
- [x] 5.2 Batch changed-file formatting, affected package builds/typechecks, owner-root Vitest/@effect/vitest tests and necessary Bun-native compatibility tests; verify those tests are included by repository test orchestration and pass with deterministic layers/clocks/synchronization.
- [x] 5.3 Run `rtk bun run check`, `rtk bun run lint`, `rtk bun run typecheck`, `rtk bun run test:types`, `rtk bun test tests/phase0.test.ts`, and relevant compiler/integration/generator/example/security suites; record exact outcomes and resolve scoped regressions without weakening assertions.
- [x] 5.4 Regenerate affected API references through existing generators and run relevant docs/example checks; verify public examples typecheck, references are fresh and generated files were not hand-edited.
- [x] 5.5 Run the repository's `rtk bun run verify` and full local `rtk bun run test:all` acceptance, reusing already satisfied checks where orchestration permits. Record failures/unavailable prerequisites honestly and keep cloud acceptance disabled; do not claim full acceptance when a required local gate is blocked.
- [x] 5.6 End phase 5 with an independent use-effect reviewer of the complete candidate TypeScript diff and resulting files, reconciling all prior path reviews with integration changes and test evidence. Resolve findings, rereview changed fixes and rerun only invalidated checks before demo acceptance begins.

## 6. Candidate-linked regression demo and generated-host E2E

- [x] 6.1 Read current demo AGENTS, README, VALIDATION, AI_VALIDATION, AI_REPAIR_VALIDATION and AI_INDEPENDENT_VALIDATION plus linked chat context. Record baseline diagnostic failures, required scripts, process/port ownership, Docker readiness, dependency realpaths and existing dirty state; verify the replay plan will preserve prior evidence and user-owned state.
- [x] 6.2 Build the candidate framework and bundled CLI, prepare the demo and retained agent-starter fixture with `RELKIT_ROOT` pointing to that worktree, and record old link targets for restoration. Verify installed realpaths, runtime build identity and fresh generated artifacts all resolve to the candidate; serialize global link changes.
- [x] 6.3 Run demo and retained fixture `check`, `typecheck` and `test`; start candidate-backed local demo/fixture runtimes with isolated state and owned endpoints. Verify health/build provenance and leave unrelated servers intact; document the Docker-only demo's release-build limitation separately.
- [x] 6.4 Run demo live smoke, validation regressions and inspector regressions against the candidate. Verify database-independent route/cache/bucket/event/inspector flows, compare historical diagnostics explicitly and save each command's output without relabeling a failed diagnostic as passed.
- [x] 6.5 Replay `verify-dev-origin.mjs` on demo and fixture, `verify-generated-ai.mjs` and `verify-realtime-disconnect.mjs` using explicit supported URL overrides and fresh evidence directories. Verify same-origin success/foreign-origin denial, invalid agent/channel input, offline tool/persistence/idempotency, stream ordering/isolation/replay, cancellation telemetry and presence cleanup.
- [x] 6.6 Run candidate `playwright.commerce.config.ts` with `RELKIT_GENERATED_HOST_URL` targeting the fixture; verify actual generated-host browser assertions and existing commerce cases pass with retained fresh output/screenshots where provided by the harness.
- [x] 6.7 Add or extend a focused generated database/auth fixture when current demo coverage does not reach these packages; verify write/read/rollback, auth session/protected routes, shared and isolated activation, failure recovery and shutdown against the actual candidate host in addition to existing dialect integration tests.
- [x] 6.8 Record paid `verify-demo-agent.mjs`, `verify-demo-luna.mjs` and `verify-luna-agent.mjs` probes as optional and not rerun without explicit paid-call authorization; verify offline evidence is fresh and any cited live-provider evidence is clearly historical.
- [x] 6.9 End phase 6 with an independent use-effect reviewer of every TypeScript change made for demo/fixture fixes and a review of replay provenance/results, including the generated database/auth coverage. Resolve findings, rereview changed files and rerun affected replays before final acceptance.

## 7. Final reconciliation and handoff

- [x] 7.1 Complete independent final review of the entire resulting TypeScript diff, including fixes after earlier reviews; verify every original and added/moved file is accounted for, all findings are resolved, public compatibility holds and required repository/demo gates have recorded outcomes.
- [x] 7.2 Stop only task-owned runtime resources and restore temporary demo dependency links/other reversible harness setup; verify original link targets, unrelated processes and user data remain intact. Follow separate demo publication instructions only if scoped demo changes were actually made, preserving unrelated changes.
- [x] 7.3 Run strict OpenSpec validation and final diff/whitespace checks; verify task completion reflects actual evidence, leave framework changes uncommitted in the intended worktree, and report reviewed-file coverage, meaningful changes, test outcomes, exclusions/blockers, provider disposition, worktree path and actual elapsed time.

Initial handoff:38/43 tasks complete. Task5.5 records actual command execution
and honest outcomes: `test:all` passes; `verify` fails at Docker release cleanup.
Tasks6.3/6.4/6.5/6.9 require the unavailable Docker-backed demo runtime and
replays before phase6 acceptance. All available fixture evidence is accepted.
Task7.2 is intentionally open:122 dependency links and native harness resources
are restored/stopped, but scoped Docker scaffold cleanup remains unverified.
Source/outcome review and strict validation are complete; full release/demo
acceptance and archival are pending. See implementation-evidence.md and retained
command logs for exact outcomes, exclusions, provenance and recovery artifacts.

After the user-authorized Docker recovery, current progress is39/43. Task7.2
cleanup is now verified: no containers or volumes remain, all122 original
dependency realpaths still match, and demo source is Git-clean. Docker Desktop
was force-stopped/started; its previously missing VM disk was recreated, without
factory reset or prune. Previous Docker data was not recovered. The remaining
phase6 acceptance tasks are blocked by denied access to the exact pinned MinIO
image on Quay and official Docker Hub, including anonymous pulls. See
docker-recovery-evidence.md; the prior failed verifier is not relabeled passed.

October 5 completion replay: all43 tasks now have their required evidence. The
user-authorized public MinIO mirror preserves the original immutable digest;
fresh Docker lifecycle, demo/fixture and independent phase6 review pass. The
final Docker-enabled packed release retry exits zero:52 packages/artifacts and
5 template definitions validate, including actual Docker-backed job-provider
scaffolds. Final source/provenance and scoped cleanup audits pass. All required
local acceptance stages are satisfied through recorded resumed checks; the prior
failed monolithic verifier remains historical exit1 evidence. Current results,
preserved exploratory failures and provenance are in
completion-evidence.md and completion-2026-10-05-1791190554/.
The completed change remains unarchived and framework changes uncommitted in the
candidate worktree until separately requested Git/archival actions.

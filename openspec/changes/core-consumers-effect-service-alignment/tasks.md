## 1. Baseline and worktree

- [x] 1.1 Refresh AGENTS/RTK, use-effect, Effect references and konsistent guidance; inventory/read every scoped authored TypeScript file including hidden/ignored files, and verify the initial 75 client + 58 inspector-api + 33 supervisor + 53 testing files reconcile with current disk contents and explicit exclusions.
- [x] 1.2 Create/reuse one managed implementation worktree from the verified current source revision, carry this change's planning artifacts, and record baseline revision/overlays; verify source parity and preservation of primary-checkout dirty work, and use the primary read-only vendor path when the worktree lacks it.
- [x] 1.3 Capture existing four-package tests/typechecks, public declaration and browser dependency/bundle baselines, plus watch/query/proxy/activation performance using existing harnesses; record commands, counts, measurements and pre-existing failures before edits.
- [x] 1.4 Read current demo guidance/reports/scripts and inspect copied-fixture feasibility, ports, Docker and package resolution; verify the exact offline/paid replay classification and preserve original demo status and evidence hashes.
- [x] 1.5 Complete independent phase review: assign a non-author reviewer to every TypeScript file changed in this phase (or record none), apply the full use-effect review in design §6, resolve findings and record file coverage plus reviewed baseline/setup artifacts.

## 2. Shared contracts, instrumentation and test ownership

- [x] 2.1 Freeze service/runtime ownership and compatibility boundaries for all four lanes, including synchronous transitions and async disposal; verify contract sketches/type fixtures preserve current exports, public result/error shapes, registry augmentation and constructor synchrony.
- [x] 2.2 Add direct Effect dependencies where used at the existing rc.115 pin, coordinate any required manifest/lockfile changes, and verify installation plus package builds without upgrading Effect/oRPC or modifying repos/effect.
- [x] 2.3 Select/reuse browser-safe shared operation instrumentation and server sink adapters; verify standalone calls, bounded metrics, monotonic durations, meaningful configured-level logs, redaction, isolated registries, sink failures and parent/sibling log-level isolation with focused tests.
- [x] 2.4 Establish owner-root tests and live/test Layer fixtures using @effect/vitest, plus bounded Bun subprocess fixtures where native behavior requires them; verify existing test discovery, all moved direct-path commands, test typechecks and no omitted or duplicate suites.
- [x] 2.5 Verify selected foundation APIs against available vendor implementation/tests/examples and installed rc.115 source; record precise missing/mismatched evidence and prove adopted semantics in focused tests before lanes use them.
- [x] 2.6 Complete independent phase review of every changed TypeScript file and all shared contracts using design §6; fix/re-review findings, rerun invalidated tests and freeze shared interfaces before concurrent package edits.

## 3. Client lane

- [x] 3.1 Refactor transport/invocation workflows into cohesive services with live/test Layers and thin existing HTTP/WebSocket/oRPC adapters; verify lazy headers, inference/error identity, request tracing and abort/return/throw during pending iterator pulls without aborting caller-owned controllers.
- [x] 3.2 Refactor shared job observation ownership using scoped streams/fibers and applicable RcMap leases; verify security-complete keys, shared first-snapshot identity, reconnect/refetch/terminal behavior, duplicate suppression, final-borrower release, 100 feeds/1,000 leases and existing create/dispose load coverage.
- [x] 3.3 Refactor realtime channel sessions and listener state with scoped ownership, explicit buffers and atomic refs; verify same-key sharing, identity/transport isolation, generation changes, checkpoint/live-tail order, one borrower leaving while another remains, and exactly-once cleanup.
- [x] 3.4 Refactor agent observation and pending-operation workflows with schema-validated persistence and scoped state; verify replay/recovery, memory-only retained inputs, capacity/eviction semantics, errors and independent accepted-server-run lifetime.
- [x] 3.5 Review/refactor React, TanStack, build adapters and all remaining client files with type/schema companions and TSDoc in the same pass; verify all 75 baseline files plus additions are covered, checked examples compile, registries still augment, entry points remain browser-safe and implementation files stay within 250 lines.
- [x] 3.6 Run the affected client suites, package and test typechecks/build, standalone telemetry tests, and browser/SSR dependency checks; record pass counts and investigate bundle/resource/performance differences against baseline.
- [x] 3.7 Complete independent phase review of every changed client/support TypeScript file using design §6 and all applicable skill families; resolve/re-review every finding and rerun invalidated checks before accepting the lane.

## 4. Inspector API lane

- [x] 4.1 Introduce query/projection domain services and thin Hono adapters; verify route/status compatibility, authorization-before-access, generation identity, bounded responses, poisoned-getter safety and redaction using existing fixtures plus deterministic test Layers.
- [x] 4.2 Refactor native job aggregation into bounded Effect traversal; verify stable ordering, filter-bound cursors, unconsumed rows, unavailable-service partial results/count uncertainty and fatal cursor-validation failures remain distinct.
- [x] 4.3 Refactor authorized controls and action idempotency into explicitly owned services; verify concurrent duplicate single dispatch, fingerprint conflicts, rejected-result behavior, generation isolation and no TTL/retry-driven replay of applied actions.
- [x] 4.4 Scope SSE subscriptions, heartbeat and pending pulls to the response; verify cursor replay/backpressure, heartbeat comments without cursor advancement, abort/source close/failure cleanup and absence of recursive telemetry traffic.
- [x] 4.5 Review/refactor all remaining Inspector files and type/schema/TSDoc companions; verify all 58 baseline files plus additions are covered, public contracts/examples typecheck, selective projection stays safe and implementation files stay within 250 lines.
- [x] 4.6 Run affected Inspector API tests, package/test typechecks/build, `rtk bun run test:inspector` and focused actual Bun heartbeat/security tests; verify real configured logging and independent telemetry before recording lane results.
- [x] 4.7 Complete independent phase review of every changed Inspector/support TypeScript file using design §6; resolve/re-review findings and rerun invalidated checks before accepting the lane.

## 5. Supervisor lane

- [x] 5.1 Refactor generation state and activation services with atomic synchronous compatibility edges; verify legal states, monotonically increasing source tokens, compare-and-switch behavior and rejection of stale candidate completions.
- [x] 5.2 Scope watcher, candidate compilation/start, readiness verification and output consumption; verify last-known-good availability on every failure, partial-acquisition cleanup, bounded diagnostics and prompt layer acquisition with supervised worker failures.
- [x] 5.3 Refactor stable proxy request/WebSocket ownership; verify public Host/Origin forwarding, HTTP and WebSocket generation pinning, stream cancellation, pending-buffer limits and target selection before asynchronous work.
- [x] 5.4 Refactor drain/shutdown scheduling and resource release; verify reverse provider order, one absolute deadline, candidate-first cleanup, actual process exit, in-flight request settlement, repeated shutdown and no detached worker/resource leaks.
- [x] 5.5 Review/refactor all remaining supervisor files and type/schema/TSDoc companions; verify all 33 baseline files plus additions are covered, errors/signatures/examples stay compatible and implementation files stay within 250 lines.
- [x] 5.6 Run affected supervisor suites, package/test typechecks/build and actual Bun lifecycle/origin tests; verify standalone logs/metrics and compare candidate activation/proxy responsiveness to baseline without competing heavy runners.
- [x] 5.7 Complete independent phase review of every changed supervisor/support TypeScript file using design §6; resolve/re-review findings and rerun invalidated checks before accepting the lane.

## 6. Testing lane

- [x] 6.1 Refactor runtime/application acquisition and shutdown services with live/test Layers; verify cleanup when provider or Drizzle/auth activation fails, pending work ownership, isolated state roots, HTTP listener release and current synchronous/Promise helper signatures.
- [x] 6.2 Refactor clock/ID/config state and native job helpers using deterministic time and synchronization; verify snapshots, cancellation, observation, admission and close without zero-delay polling or hidden wall-clock reads.
- [x] 6.3 Refactor bucket/cache/provider replacement helpers with schema-derived contracts and typed internal failures; verify cloning, writes/increment/per-write TTL, snapshots/restore, post-write failure points and cache getOrSet semantics without introducing memo-cache eviction into authoritative fake storage.
- [x] 6.4 Refactor event/job harness workflows and failure injection with structured ownership; verify fan-out, restart/ack gaps, ordering, retry bounds, native task admission, cancellation and pending-operation cleanup using existing contract fixtures.
- [x] 6.5 Refactor scripted model, agent approval and trace helpers; verify hanging-turn interruption, pending-approval reset/release, privacy, limits and substitutable layers while retaining deterministic model output and existing assertion behavior.
- [x] 6.6 Review/refactor all remaining testing files and type/schema/TSDoc companions; verify all 53 baseline files plus additions are covered, production helpers remain in src, test-only fixtures live in tests, examples typecheck and implementation files stay within 250 lines.
- [x] 6.7 Run affected testing suites, package/test typechecks/build, fake-provider contracts and dependent engine/event integration tests; verify deterministic isolation, structured configured-level logs and metrics for standalone helpers.
- [x] 6.8 Complete independent phase review of every changed testing/support TypeScript file using design §6; resolve/re-review findings and rerun invalidated checks before accepting the lane.

## 7. Dependency-order integration

- [x] 7.1 Integrate accepted lanes in client → inspector-api → supervisor → testing order; verify shared interfaces, runtime/scope ownership and package export/type compatibility after each integration, resolving cross-lane changes under a single owner.
- [x] 7.2 Exercise composed client/Inspector/supervisor/testing flows with actual transports; verify standalone versus composed telemetry counts, child logging context, cancellation boundaries, no recursive Inspector logs and no accepted job/agent cancellation on observer disconnect.
- [x] 7.3 Reconcile final source/test inventories including added, moved, removed and unchanged files; verify no authored file was skipped and runner discovery/direct script references still execute all relevant suites.
- [x] 7.4 Complete independent phase review of every integration-changed TypeScript file using design §6, including previously approved files modified again; resolve/re-review findings and rerun invalidated checks.

## 8. Repository verification and performance

- [x] 8.1 Run scoped formatting plus `rtk bun run lint`, `rtk bun run check`, `rtk bun run konsistent -- validate`, and the convention audit; verify schema validity and resolve attributable structural findings without weakening rules to suppress violations.
- [x] 8.2 Run `rtk bun test tests/phase0.test.ts`, `rtk bun run test:types`, affected package/test typechecks, `rtk bun run test:packages`, and relevant integration/restart/security/Inspector suites; record exact outcomes and resolve introduced regressions.
- [x] 8.3 Run full local `rtk bun run verify` and the repository browser/generator/docs/example checks relevant to changed exports and helpers; verify generated artifacts through their generators, record unavailable host-dependent checks and keep cloud acceptance disabled.
- [x] 8.4 Repeat baseline browser bundle/watch-resource, Inspector query, activation/proxy and operation-overhead measurements on the assembled candidate with identical workloads; investigate median increases above 5% or p95 above 10% and record resolution or remaining risk without removing required instrumentation.
- [x] 8.5 Complete independent phase review of all TypeScript fixes introduced during verification using design §6; re-review affected earlier approvals and rerun only invalidated checks before freezing the candidate for demo replay.

## 9. Existing demo and retained offline fixture acceptance

- [x] 9.1 Prepare isolated copies of the existing demo and retained agent fixture as described in design §8; build/link candidate packages through explicit local paths, verify probe/runtime package resolution, create fresh evidence directories and confirm original demo/history/shared links remain untouched.
- [x] 9.2 Run check → typecheck → tests in each copy and start candidate-owned demo/fixture hosts with the expected ports/local providers and separate state; verify the six demo and six fixture tests, readiness and Docker availability, without paid model credentials or an origin allowlist workaround.
- [x] 9.3 Replay demo test:live, test:regressions, test:inspector:regressions, evidence:graph and inspector-api-evidence; execute all 11 live checks and five diagnostic assertions, inspect browser/API artifacts and compare fresh baseline/candidate outcomes; fix introduced regressions and scoped blockers, and withhold full demo sign-off for unresolved baseline failures.
- [x] 9.4 Replay verify-dev-origin against both hosts and the independent foreign-origin assertions; verify absent/same-origin HTTP 200, same-origin WebSocket establishment, foreign-origin HTTP 403 and rejected foreign WebSockets with fresh evidence.
- [x] 9.5 Replay verify-generated-ai and verify-realtime-disconnect against the retained offline fixture; require 9/9 generated-host checks and presence cleanup for iterator return and explicit abort, recording assertion results and timing under new RELKIT_AI_EVIDENCE_DIR paths.
- [x] 9.6 Run the complete commerce Playwright config from the candidate worktree with RELKIT_GENERATED_HOST_URL set; verify all three tests pass and the generated-host regression is not skipped, with no concurrent 3010/4010 runner.
- [x] 9.7 Repeat post-load Inspector/API/diagnostic checks, collect safe commands/logs/provenance/browser evidence, and clean up only owned processes/resources; verify original demo source/history/evidence are preserved and label paid Luna replays and any unavailable check as not run rather than passed.
- [x] 9.8 Complete independent phase review of every TypeScript file changed during demo fixes or harness integration using design §6; review assertion parity and candidate package provenance, resolve/re-review findings, and rerun all affected demo/repository gates on the final source.

## 10. Final coverage and handoff

- [x] 10.1 Reconcile all scoped authored files with implemented or reviewed-unchanged status and every changed TypeScript path with a non-author reviewer/result; verify every applicable use-effect family is addressed, justified exclusions are narrow, and final additions/moves are included.
- [x] 10.2 Validate the complete change with `rtk openspec validate core-consumers-effect-service-alignment --strict`, inspect the final diff, and record package coverage, checks, vendor gaps, demo outcomes, performance findings, worktree path and actual elapsed time; verify task completion reflects evidence and leave changes uncommitted.
- [x] 10.3 Perform the final independent review of every TypeScript file changed in this phase plus the assembled cross-package diff and evidence; apply use-effect per design §6, fix/re-review findings and rerun invalidated checks before marking implementation complete.

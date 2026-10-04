## Context

See proposal.md for motivation and the four delta specs for observable requirements. The implementation baseline is commit 56cb00a4e09f7908d456848e69f6b623bd859c84. Scope is 338 authored TypeScript files: runtime-effect 27, providers-local 109, engine 75, runtime-hono 127. Planning read every file through EOF. Root/package pins and installed Effect agree on 4.0.0-rc.115.

## Goals / Non-Goals

Goals: coherent internal Effect services with replaceable live/test Layers, truthful failures, owned concurrency/resources, standalone telemetry, complete type/schema/TSDoc organization, and preserved compatibility.

Non-goals: public Effect authoring requirements, new persistence formats, replacement invocation kernels, integration SDK upgrades, cloud work, vendor checkout repair, commits or pushes.

## Decisions

### Shared execution foundation

Use named Context.Service classes following RELKIT conventions, Layer.effect(Service, Effect.gen(...)), Service.of and Layer.provide. Static test implementations may use Layer.succeed. Build implementations once per provider/generation/runtime lifetime, not per operation. Required authority is explicit; Context.Reference is reserved for genuinely ambient defaults.

runtime-effect exports observeExecution(domain, operation, effect, workload?, terminal?) as the common instrumentation primitive. Domain labels are runtime, local, engine and http; operation labels are declaration-owned literals. The observer is lazy, records monotonic duration and terminal outcome, and uses the caller's Metric registry, tracer and logger. The optional domain policy preserves normalized kernel defect/cancellation classification and omits terminal telemetry for suspension. Observational failures are isolated at this observer boundary. Compatibility adapters execute the owning operation once. Named Effect.fn owns operation spans; pure leaf calculations and instrumentation utilities do not recursively instrument themselves.

observeExecutionStream starts at first pull and joins terminal observation before consumer cleanup completes. A Deferred handshake starts its counter and monotonic clock before the first source pull. Stream.withSpan owns the complete consumption span, including source operations and cleanup. EOF succeeds, early return interrupts, and failures retain their original Cause or normalized public identity. Engine and Hono share this helper. Installed Stream.onExit/toAsyncIterableWith implementations and documented executable examples establish scoped cleanup semantics; retained HttpEffect scope-transfer code provides vendor usage evidence. Core Stream/Deferred tests are absent, so local regressions cover controlled duration, failure/defect identity, early return, pending-pull interruption, idempotent cleanup and consumption after the creating scope closes.

Synchronous compatibility functions execute only synchronously completable effects; resource acquisition and scoped workers are never smuggled through runSync. Promise adapters use their existing owner runtime, preserve error identity via explicit typed-error translation, and pass AbortSignal only at capable native boundaries. Keep @relkit/invocation as owner of its kernel/failure/deadline/span primitives.

### Domain boundaries and structured work

runtime-effect owns generation resources, clock/context bridges, logger/tracer integration and telemetry. providers-local groups state/filesystem, jobs, events, cache, buckets, realtime and agent-state services. engine groups invocation, generation/admission, registry/providers, events/jobs and task execution. runtime-hono groups request mapping/security/lifecycle, agent coordination, jobs/realtime observation, limits/static/MCP transport boundaries.

Use Effect traversal for effectful collections, retaining sequential authoritative state changes and independent fan-out failure isolation. Scoped fibers own workers, listeners, renewals and polling; acquisition returns promptly. Use Ref/Deferred or equivalent verified synchronization for in-process state; preserve cross-process filesystem locks. Keep masks limited to atomic commit/acquisition/release sections. Retry only proven idempotent operations; persisted queue retry transitions and durable sleep remain authoritative.

Generation-owned agent runs survive request/SSE cancellation. Request and body/observation scopes close separately. Stream scopes remain alive after producing an AsyncIterable and close on consume/return/error/idle timeout. FIFO admission coordinates function and trigger capacity together, without acquiring generation leases for waiting calls. Task suspension remains nonterminal control flow.

### Boundaries, models and compatibility

Decode real untrusted persisted/wire inputs with Schema, preserve optionality/defaults/unknown-field policy and existing schema authorities. Derive companion types; use Data variants for closed internal state decisions. Map internal Schema.TaggedError failures to existing public constructors/inheritance/codes where required. Preserve defects and interruption and deliberately handle mixed cleanup/body causes.

Use Config during layer acquisition while preserving explicit option/environment precedence. Keep pure deterministic indexes and calculations direct. Effect Cache is not a substitute for persisted byte-bounded LRU or public cache writes; use its single-flight behavior only where failure TTL, producer, and invalidation semantics match. Queue/PubSub coordinate callbacks/broadcast only where appropriate; they do not replace durable journals. RcMap and traits are adopted only for demonstrated resource/equality needs.

Keep existing oRPC handlers as transport adapters: the installed beta lacks the experimental Effect adapter, so no new experimental dependency is introduced.

### Logging and documentation

Emit structured logs for lifecycle, outcomes, recovery and failures using bounded operation context; redact payloads/secrets before all sinks. Respect caller logger provisioning and configured levels. Children inherit annotations/configuration; apply References.MinimumLogLevel locally before forking and test parent/sibling isolation. Keep exporters/logger sinks at runtime edges and preserve observational failure isolation.

Move named aliases/interfaces into colocated .types.ts, executable schemas into .schemas.ts, and services/errors into runtime modules. Use intentional barrels and type-only re-exports; no empty companions or circular imports. Document callables with summary, each parameter, return/lazy semantics, generic roles, failures, required services and lifecycle. Check examples for nontrivial composition/resource ownership; add one blank line between declarations. Keep implementation files at most 250 lines.

### Test migration and coordination

One managed worktree contains four exclusive package lanes, with the coordinator owning runtime-effect plus root manifests/lockfile/scripts/integration. Freeze shared helper and lifetime contracts before worker edits. Integrate runtime-effect, providers-local, engine, runtime-hono in that order.

Move all package tests/helpers into owning tests directories and use Vitest/@effect/vitest. Preserve every existing scenario. Node-compatible filesystem helpers replace Bun.file in ordinary tests; real Bun servers/WebSocket/MCP behavior uses supervised Bun child fixtures with Vitest assertions, readiness handshakes and cleanup. Effect tests use TestClock/Deferred/Queue rather than arbitrary sleeps. Existing recursive runner already routes Vitest imports; explicit jobs/MCP scripts and relocated shared cohort imports require updates.

After the engine lane passed its final acceptance and froze implementation, its worker took a disjoint Hono documentation tranche of stable projection/validation modules. The Hono owner reserved those paths and retained lifecycle edits. This reallocation keeps exclusive file ownership while shortening the final documentation pass.

## Vendor evidence and gaps

Mandatory read-only reference: /Users/mustafaelsayed/Workspace/relkit/repos/effect, including ignored files via rg --no-ignore. Do not create/update/install in the reference. Core Effect/Context/Layer/ManagedRuntime/Clock/Schema/Ref/Config modules/tests and package manifest are absent; .agents/AGENTS.md and LLMS.md are absent. Retained modules sometimes use older effect/process, effect/sql and effect/observability paths, while rc.115 uses unstable subpaths.

Retained evidence includes ai-docs/src/40_sql/10_basics.ts for Context.Service/Layer.effect/Effect.fn; packages/effect/src/persistence/PersistedCache.ts and corresponding tests; PersistedQueue implementation/tests for scoped fibers and schedules; process/ChildProcessSpawner.ts and process tests for acquisition and stream ownership; test/StackCapture.test.ts for named function behavior; test/observability/OtlpMetrics.test.ts for isolated registries and controlled clocks.

Installed source and internal delegates are executable signature/lifecycle authority where core vendor evidence is missing. Initial checked patterns include Context.Service, Layer.effect/effectContext, ManagedRuntime.make/dispose, Effect.fn/gen/tryPromise/onExit/acquireRelease/forkScoped/forkIn, References.MinimumLogLevel, FiberMap ownership, and Stream async-iterator conversion. acquireRelease supports interruptible acquisition in this pin; finalizers have never typed failure. Every newly selected API/pattern requires its own implementation/examples/tests inspection; disclose a missing source/test and use installed source plus focused local regression, then version-matched upstream if inconclusive. Reuse evidence across lanes without a separate per-symbol ledger.

## Risks / Trade-offs

### Implementation evidence so far

Runtime generation uses the existing Config Effect directly. Its resolver contract is replaced before Layer construction; acceptance proves lazy startup, single acquisition of the shared resolver, partial rollback, interruption and idempotent disposal. Synchronous startup validation/resource ordering retains the original public TypeError. Internal generation validation uses Schema.TaggedError, then translates its retained cause at the compatibility boundary. Core Schema source/tests are missing in the vendor checkout; installed Schema.ts documents and implements TaggedError at this pin, and local acceptance verifies the typed tag and original TypeError cause. Older retained persistence code uses Data.TaggedError, so it is not signature evidence for this Schema API.

Logger filtering reads the explicitly supplied MinimumLogLevel reference through Context.getOrUndefined, falling back to factory configuration. Installed Context.ts documents the raw lookup's distinction from reference defaults; retained RPC/HTTP code demonstrates the older unsafe raw lookup, while core Context tests are absent. Focused acceptance covers direct logger options, layer defaults, All/None, child override inheritance, parent/sibling isolation, redaction recovery and independent sink delivery. Logger event projection remains a pure adapter; tracer/failure aliases reuse invocation-owned primitives and their existing tested contracts rather than adding duplicate operation counters.

Matching Vitest/@effect/vitest development dependencies are declared directly by all four owning packages. Frozen install passes. Bun's lockfile also synchronizes existing workspace versions from the baseline's stale 0.5.2 entries to its already-pinned 0.5.4 manifests; external dependency versions stay unchanged.

One native-context bridge retains Effect dependencies across HTTP → engine → local-provider Promise callbacks. It prefers the currently executing fiber over asynchronous local storage: a Deferred completion may synchronously resume a parent fiber under a child's native callback. Focused regression proves that this does not leak the child's minimum level into its parent, and that nested native failures restore their parent context. The bridge transfers configuration only; invocation identity remains in @relkit/invocation and generation/response scopes keep resource ownership. Retained vendor SqlClient.ts and HttpEffect.test.ts demonstrate fiber-context capture/restoration; retained HTTP/RPC implementations use Fiber.getCurrent. Core Fiber implementation/tests are missing, so installed Fiber.ts and internal/effect.ts provide the rc.115 accessor/run-loop semantics, backed by local regression.

Managed generation startup accepts optional existing LoggerOptions and defaults to quiet sinks at its standalone Promise boundary. Direct Layer composition retains caller logger provisioning. Acceptance verifies real Info-level generation acquisition/release records. Clock bridge examples are checked under an explicitly disposed ManagedRuntime. Duration observation tolerates a defecting custom monotonic clock while retaining the authoritative operation result; it omits unavailable duration rather than inventing one.

Failure projection avoids user-defined Error/array getters and inaccessible Proxy descriptors. Node 24 uses a shared built-in stack accessor while Bun uses a data property; only that captured native accessor is allowed, after checking name/message descriptors. This preserves ordinary development stacks and redaction while preventing custom getters from running. Pure formatting, topological ordering, immutable metadata projections and invocation-owned aliases remain direct helpers under their owning operations.

Runtime-effect's refreshed authored inventory is 44 TypeScript files (33 source and 11 test/example files), covering all 27 original files and their new companions. Its ten Vitest suites pass 50 tests; source build and strict test/example typecheck pass. Compatibility test cases intentionally exercise real Promise/ManagedRuntime edges with ordinary Vitest tests, while pure Effect timing, substitution and fiber tests use it.effect and TestClock/Deferred. Existing generic Graph/Manifest/Providers/Observability/IdSource/Shutdown service tags retain their public identities and caller-provided implementations; unused generic contracts do not acquire invented resources or features. Quiet native boundaries acquire one empty logger context and avoid constructing records for inaccessible collectors; explicit sinks, collectors, redactors and fiber-local levels retain their behavior.

Engine's completed inventory is 128 authored TypeScript files: 103 source, 24 tests/examples and one test configuration, covering all 75 originals. Its 23 Vitest suites pass 96 tests, with source/declaration build, strict test types, formatting and whitespace checks passing. Services own invocation, generation, FIFO admission, provider/registry dependencies, event/job materialization and tasks. Provider acquisition waits for a native factory to settle before releasing the masked acquisition boundary; existing factories have no cancellation contract. Durable sleeps/retries remain persisted provider transitions. Invocation kernel span timestamps remain epoch-based; shared operation durations use the monotonic clock. Standalone InvocationService and TaskExecutionService record actual semantic outcomes, including pre-aborted cancellation and normalized defects. An explicit kernel suspension notification marks opaque continuation values before translation, preserving start hooks while omitting completion/failure hooks and terminal counters.

Final stream review adds first-pull suspension classification, quiet outer iterator context, and cancellation before iterator cleanup joins. A stronger blocked-pull regression exposed a signal bridge in @relkit/invocation that disconnected when the handler returned an iterable. The narrow surrounding kernel correction supplies a platform-composed AbortSignal for declared streaming output while the existing callback bridge releases its listeners at settlement. Native signal linkage remains capable during deferred pulls without wrapping or mutating the returned output. Nonstream handlers retain their original bridge signal, including disconnection after completion. Ownership remains in @relkit/invocation. This necessary production lifetime correction extends the surrounding changes beyond runner/configuration/test updates, while preserving public exports, exact output identity, branded receivers, errors and nonstream cleanup. No execution primitive is duplicated in another package. Owning handler-bridge tests and sixteen engine metric/lifetime tests cover nonterminal iterator return/throw recovery, partial opening, blocked pulls, second-consumer isolation and actual logging.

Advisory engine callbacks execute immediately when synchronous, preserving their existing ordering and native Effect context. Actual returned Promises run in an invocation-owned FiberSet and are interrupted at invocation/stream closure; external callback side effects expose no AbortSignal. Throws/rejections remain observational. A 10,000-callback comparison improved the warm observer path from 63–104 ms to 0.84–2.51 ms, while focused acceptance verifies immediate ordering, context, closed-scope suppression and pending Promise cleanup. Installed FiberSet/Scope sources cover this pattern where vendor core tests are missing; retained Socket, LogLevel and WorkflowEngine examples/tests provide ownership and deterministic cleanup evidence.

Providers-local's frozen inventory is 190 authored TypeScript files: 169 source and 21 tests/helpers/examples, covering all 109 originals. All 79 tests pass across 19 suites; source/test/example types, formatting and whitespace checks pass. The largest implementation has 247 lines. Cache, bucket, agent-state, realtime, durable journal, native/legacy job, scheduler, event/delivery and observation collection services retain production and deterministic test contracts. Regression coverage includes clock/random substitution, shared production interruption, lock cleanup on defects, concurrent cache close, ephemeral nonblocking close, configured logs/redaction/metrics and recovery warnings.

Provider capabilities retain persisted byte-based LRU, durable journals and queue retry/acknowledgement protocols. Generic cache/queue replacement would change those contracts. PubSub, RcMap and equality traits provide no additional ownership requirement in these domains. Explicit options remain their configuration inputs; Config is used where environment resolution already belongs to runtime acquisition. Native handlers lacking cancellation are joined where durable settlement requires completion; ephemeral close remains nonblocking and explicit drain waits. Scheduler overlap behavior is unchanged. Observation collection does not instrument itself. Pure projections, fixture callbacks and compatibility re-export modules retain their existing roles.

Provider-specific vendor usage/tests include arbitrary/Arbitrary.test.ts seeded Random.next isolation, observability/OtlpExporter.test.ts controlled flushing with Clock.currentTimeMillis/TestClock, ai/McpServer/McpServer.test.ts Deferred/Layer notification coordination, and persistence/PersistedQueueTest.ts scoped consumer interruption/join. Installed Clock.ts/Random.ts supply the missing rc.115 implementations and documented examples; local native-context tests verify injected Clock/Random values. No beta API assumptions or dependency upgrades are used.

Runtime-hono's frozen inventory is 237 authored TypeScript files: 179 source and 58 tests/support, covering all 127 originals. All 33 original suites are retained in the owning tests directory. Its 40 suites pass 120 tests with the optional official MCP Inspector scenario enabled; the default run has 119 passes and one optional skip. Source/test/native-fixture types, formatting, whitespace and 14 HTTP integration regressions pass. All implementation files meet 250 lines; 51 type companions and four schema companions retain exports. Six canonical composition examples and linked lifecycle examples are checked.

Hono services own request mapping/security/body, agent coordination/generation tasks, jobs, realtime, limits, static files and MCP. Captured application configuration excludes Scope so each response or generation supplies its own owner. Accepted native tasks retain generation ownership while observer disconnection closes only request/observation work. Cloned body-reader cancellation handles its rejection and releases the reader lock without waiting for the caller-owned tee branch. Foreign authorization callbacks expose no abort contract; timeout ends the wait without claiming to cancel arbitrary external work. Test fixtures explicitly track and join accepted native work before removing temporary directories.

The final authored audit covers 600 TypeScript files across the four packages, including every original file and 262 additions. Searches include hidden/ignored authored files while excluding dependencies, compiled/generated output and vendor code. Named declarations reside in type/schema companions; preserved legacy paths contain compatibility re-exports. The AST contract check finds no missing summary/parameter/result/generic tags among 1,263 named callables; lane EOF reviews, checked examples and concrete contract descriptions complete the semantic review. No scoped implementation exceeds 250 lines. At initial worktree acceptance, packages/functions/src/define-function.types.ts had 260 lines and blocked repository verification. The primary-checkout type extraction below resolves this finding.

The first packed Docker readiness attempt passed minimal and Inngest scaffold variants, then failed an Effect MQ scaffold route-add/dev exercise with a request timeout. Its repeated LISTEN warning has a separately confirmed baseline dependency mismatch: effect-mq 0.7.0 treats PgClient.listen as Stream<string>, while pinned SQL-PG rc.115 returns Effect<Queue.Dequeue<Notification>, SqlError, Scope>. A minimal expression reproduces the same channel.transform TypeError in the original checkout before any network acquisition. Pins and integration sources are unchanged. The SDK polling fallback means that warning alone does not establish the cause of the subsequent request timeout.

An isolated second readiness attempt passed minimal, then failed the Inngest scaffold route-add/dev exercise with a request timeout and Bun 1.3.10 segmentation fault during HMR. The native crash was not reproduced in the original checkout and is not classified as a proven baseline failure. These two historical readiness attempts failed. Their owned child processes, containers and temporary fixtures were cleaned up; no cloud execution was requested. The primary-checkout follow-up fixes HMR responsiveness and passes the complete packed Docker readiness gate.

Fresh-worktree compiler fixtures now link their owning app package explicitly instead of assuming an undeclared root node_modules workspace link. The generator's repair assertion reads the existing CLI Next pin rather than the stale hardcoded version; the old assertion also failed in the original checkout. These changes affect test setup only. Existing public-authoring JSDoc gate failures outside the execution packages were reproduced in the original checkout and are reported as baseline limitations.

Three DuckDB fixture failures also reproduce in the original checkout. Default seven-day storage retention deletes their fixed September 25 records on October 2; query bounds cannot recover deleted records. Persistence/import fixtures now pass the existing maxAgeMs retention option explicitly, preserving historical data independently of wall time. Production storage and query code is unchanged.

Four CLI fixture setups also depended on accidentally hoisted @relkit/app and @relkit/testing root links that a frozen fresh-worktree install does not create. Their owned fixture node_modules directories now link the declared dependencies explicitly. The full 106-test Bun CLI cohort passes with the strict project checker unchanged. Earlier final verification attempted multiple heavy runners alongside a workspace build and caused timing failures; final acceptance runs sequentially without extending deadlines.

Performance baseline: original checkout HEAD 56cb00a4e09f7908d456848e69f6b623bd859c84, Bun 1.3.10, Apple M1 Pro/darwin arm64, 2026-10-02T12:48:13Z. The existing workload harness needed an await for the asynchronous inspector layout. That exact harness correction was applied in the isolated baseline harness and the worktree; the original checkout stayed unchanged. Command: bun /tmp/relkit-baseline-performance.ts; complete report retained at /tmp/relkit-execution-baseline.json.

| Workload                     | Median ms | p95 ms | Aggregate ms |
| ---------------------------- | --------: | -----: | -----------: |
| Warm direct invocation (100) |    11.920 | 21.448 |     1358.714 |
| Warm route (100)             |    13.547 | 18.675 |     1418.294 |
| Request stream (100)         |     0.246 |  0.512 |       29.805 |
| Local jobs (100)             |         — |      — |     4145.416 |
| Events (100 × 8 fan-out)     |         — |      — |    77268.974 |
| Inspector graph (1000 nodes) |         — |      — |      949.346 |

The baseline instrumentation comparison itself already exceeded several review thresholds (direct invocation +8.695% median/+26.838% p95; operation-heavy +7.323%/+11.978%; HTTP +12.726%/+10.031%). Candidate measurements were repeated without competing builds, tests or generator fixtures.

| Workload               | Baseline median / p95 ms | Candidate median / p95 ms | Change median / p95 |
| ---------------------- | -----------------------: | ------------------------: | ------------------: |
| Warm direct invocation |          11.920 / 21.448 |           15.504 / 20.716 |      +30.1% / −3.4% |
| Warm route             |          13.547 / 18.675 |           16.228 / 21.505 |     +19.8% / +15.2% |
| Request stream         |            0.246 / 0.512 |             0.186 / 0.209 |     −24.4% / −59.2% |

Local jobs decreased from 4145.416 to 3682.311 ms (−11.2%); events from 77268.974 to 34194.922 ms (−55.7%); inspector layout from 949.346 to 384.275 ms (−59.5%). The inspector implementation is unchanged, so its improvement cannot be attributed entirely to this refactor.

Three initial isolated alternating-order rounds of 200 invocations confirmed material latency regression: direct invocation median +32.6–41.1%, p95 +14.7–39.5%; HTTP route median +37.0–41.6%, p95 +24.6–36.0%. CPU profiling identifies Error stack capture (about 12.5% self time), Effect run-loop/context work and span/metric construction. Installed Effect.fn captures an Error for each named call; rc.115 exposes no per-function capture toggle. Quiet logger-context reuse and synchronous advisory callback execution reduced overhead but did not resolve that initial result. Global stack-trace settings and required instrumentation remain intact. The primary-checkout optimizations below resolve the regression; every final alternating round stays within the review thresholds, as recorded in evidence/acceptance.md.

The full candidate harness completed at 2026-10-02T15:05:54Z, before the final stream refinements. Its request-stream workload uses the existing static endpoint. The alternating-order comparison was repeated on the exact final source at 16:05 UTC after all verification workers finished. Raw baseline, full candidate and final-source alternating-order reports are preserved in evidence/. No external dependency pin changed.

Stream.withSpan evidence includes installed Stream.ts documentation and its embedded executable test, plus the Channel.withSpan acquire/use/release implementation and clock-based finalization. The vendor Chat.ts uses Stream.withSpan, but its retained Chat tests do not cover stream-span duration; core stream tests are missing. Local acceptance verifies a 125 ms TestClock span, source operations inheriting the consumption span, no completion before consumption, and exactly one terminal observation.

- Changed public errors or synchrony: preserve boundary constructors and test existing assertions.
- Closing scopes too early: test deferred stream/body lifetimes and detached accepted runs.
- Changed durable semantics: retain journal/receipt/fencing/locking protocols and real restart/fault tests.
- Default fail-fast traversal changing fan-out: isolate expected per-delivery outcomes.
- Additional logging overhead or sensitive capture: bounded labels, safe metadata, sink tests and performance comparison.
- Missing vendor sources: explicit gaps, installed-version verification and local regression evidence.
- Bun-specific tests under Node: Vitest-owned Bun fixtures rather than assertion-only import replacement.

## Migration Plan

### Primary-checkout acceptance follow-up

At the user's request, the complete uncommitted implementation was transferred to
the primary checkout and verified byte-for-byte against the managed worktree.
Remaining acceptance work started on 2026-10-02 at 16:21:31 UTC. Follow-up tasks in
tasks.md distinguish this work from the preceding implementation/investigation.

Public-authoring executable examples and a pure function-inference type extraction
resolve the prior documentation and 260-line-file failures. Generated documentation
uses the existing pipeline. The Effect MQ integration supplies a private PostgreSQL
client view adapting rc.115's scoped notification queue to the payload Stream
expected by effect-mq 0.7.0. The native client, SQL operations, SDK polling/retry
policy and dependency pins remain unchanged. Tests exercise the installed SDK's
queue and broadcast wake-ups, lazy resubscription, interruption, release and SQL
error identity. Core vendor SQL-PG sources are absent; installed PgClient,
PgConnection, Queue and Stream implementations establish the pinned contract.

Invocation instrumentation now defines its stack boundary once and reuses intrinsic
metric handles per declaration-owned InvocationOperation. These handles retain no
caller context; Effect's internal WeakMap resolves hooks separately for each
registry. Nonconflicting caller metric attributes remain inherited. A collision
regression found that intrinsic attributes ordinarily give caller attributes
precedence; the update helper derives a temporary metric context only when the
caller supplies operation, preserving the original owned-label precedence without
changing the workflow context. Shared execution observation batches synchronous
metric bookkeeping within Effect.withFiber and keeps Clock Effects, failure
isolation, structured logs and span annotations intact.

Vendor evidence for these optimizations includes StackCapture.test.ts, intrinsic
attributes in PrometheusMetrics.test.ts, isolated registries and controlled time
in OtlpMetrics.test.ts, and updateUnsafe usage in cluster/Sharding.ts. Core Metric
and Clock files/tests remain missing. Installed Metric.ts implements Metric.update
through updateUnsafe with the executing context, caches hooks per registry, and
defines attribute-merge precedence. Local tests cover replay laziness, substituted
observers, registries, inherited/colliding attributes, controlled durations and
original success/failure/defect/interruption channels.

The comparison baseline is now an isolated git-archive snapshot of HEAD, with
workspace exports redirected to that snapshot's TypeScript and existing external
dependencies linked read-only. The primary checkout is the candidate. This avoids
comparing two refactored checkouts after transfer. Final performance and acceptance
results are recorded in evidence/acceptance.md after the lanes freeze.

Packed HMR diagnosis identified synchronous project checking on the CLI event loop
that also serves the stable proxy. Development checks now execute in a private Bun
subprocess, while the parent retains generation and provider ownership. The worker
sends only the serializable CheckResult or a bounded failure message, exits after
IPC flush, and is joined by its parent. On POSIX, an owned process group is reaped
on completion, cancellation and failure, including config-created descendants.
Windows currently guarantees direct-child cleanup only; descendant process-group
acceptance is unavailable on this macOS host. No public CLI flag or project format
changes. The regression holds its original 1,000 ms responsiveness bound: the
inline checker fails at 1,567 ms, and the subprocess implementation passes. All 19
focused HMR, recovery, persistence and child-cleanup tests pass, as does compiled
worker IPC. Complete packed Docker readiness now passes all engine and template
variants, direct/CLI installation, live additions, builds, dev/HMR and owned cleanup.

The boundary scanner now skips generated workspace-root coverage directories while
continuing to scan authored src/coverage paths. The regression preserves existing
coverage artifacts, proves generated output is ignored, and proves the same forbidden
content in authored source still fails.

The primary checkout's CodeGraph daemon socket cannot be copied into a Stryker
sandbox. An anchored root .codegraph exclusion retains every configured mutation
and test target, including nested authored fixtures. Coverage and mutation criteria
are unchanged. The complete jobs quality gate passes with 735 mutants: 478 killed,
239 survived and 14 uncovered; all required semantic categories pass.

A repeated repository package run exposed an agent-test fixture that subscribed to
abort without checking an already-aborted signal. A stop before listener
registration left its native Promise pending and cascaded into cleanup timeouts.
Both native mocks now share a cancellation-aware fixture wait. Deterministic
before/after-abort cases and five successive focused suite runs pass. Production
generation ownership still joins accepted work; no deadlines or runtime behavior
were changed for this fixture correction.

Recording-enabled HTTP profiling identified an implicit logger collector whose
private retained buffer is inaccessible to the application. When an app already
owns its observability sink, Hono now uses the existing stateless
admitObservabilityRecord boundary for implicit admission. Explicit logger collectors
still receive the same records and retain their policies. Default quiet logging,
levels, structured output, redaction, record branding, Promise assimilation and
sink failure isolation are preserved. Focused tests verify actual operation logs,
absence of private collector creation/collection metrics, explicit collector
identity and synchronous/rejected/throwing-then-getter sink failures. Installed
rc.115 Metric.value and retained observability metric examples support these
assertions; core Metric and Logger tests and OtlpLogger.test.ts remain absent in
the vendor reference, while OtlpLogger.ts documents the callback-based logger.

A proposed duplicate-projection removal was rejected during independent review:
reprojection changes nested **proto** and depth-boundary Error values before custom
redactors observe them. Existing projection behavior remains intact. A regression
checks immutable projected input, getter avoidance, prototype normalization,
depth truncation and sanitization after in-place nested custom-redactor changes.

One-request comparison attributes six additional Info logs to independently owned
request mapping, engine admission, engine invocation, HTTP invocation, response
mapping and route operations. The HTTP invocation boundary accepts arbitrary
structural HttpEngine implementations and owns cancellation and settlement; its
observation is required even when the configured engine provides no telemetry.
Adapters do not repeat the same domain/operation observation. Profiling also found
two empty task-hook spans when no hooks were configured. The optional hook adapter
now returns Effect.void before entering the private named operation. Defined hooks
retain their span name, laziness, timeout, signal, order and diagnostic isolation.
This removes absent work while retaining required lifecycle and service records.

Final recursive acceptance exposed an ENOTEMPTY cleanup race in a generation
retirement fixture. Its cancelled control observer had settled while the native
readControls → recoverExpiredControls → store.update Promise still owned a
filesystem transaction. That provider API has no AbortSignal or close contract;
retirement interrupts generation-owned observation and accepted execution, while
the application-owned provider operation may still settle. The fixture owns its
temporary directory and now registers provider Promises alongside accepted runs
before teardown joins and removes state. Equivalent direct-process fixtures use
the same owner; Bun child fixtures already reap their process before parent removal.
A held native read proves accepted execution can settle first and directory cleanup
must wait for the provider write. Disabling registration fails that assertion.
No production cancellation guarantee, retry, timeout or persisted format changed.

1. Refresh scope/guidance/evidence and performance baseline, then establish shared execution contracts.
2. Implement package/domain lanes with tests, documentation and organization together.
3. Integrate in dependency order and update only required surrounding scripts/fixtures/docs.
4. Run focused checks then repository verification, phase-zero, strict OpenSpec, declaration/sink and performance gates. Investigate median regressions over 5% and p95 over 10%.
5. Audit every scoped authored file, complete only proven task checkboxes, and report exclusions/blockers/actual elapsed time. Changes remain uncommitted. Existing public/state formats require no migration; any rollback must preserve unrelated user work.

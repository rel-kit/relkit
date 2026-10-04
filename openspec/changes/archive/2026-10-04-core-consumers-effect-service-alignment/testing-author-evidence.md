# Testing phase 6 author evidence

Frozen 2026-10-03T16:46:06.855Z; baseline b0f77720764fd61e9872b0995e456014a611ba37. Exact path/SHA and review reread map: `/tmp/relkit-testing-phase6-inventory.json`.

131 authored TS: 98 source, 32 tests, one Vitest config; strict JSON test config included independently. 53 baseline paths reconciled: 40 modified source, one reviewed unchanged public index, 12 moved legacy counterparts. Maximum implementation length 247 lines. 77 paths changed since independent initial 125-path EOF review; six new paths included.

Checks: 25/25 Effect cases (10 files, 4.93s), final combined 89/89 Bun cases (18 files, 444 expects, 2.50s), engine materialization 8/8 cases (2 files, 805ms), source/test typecheck and build pass, Prettier comparison clean. Legacy exact AST comparison: 138 outer assertion chains across all 12 moved paths, zero mismatches; native legacy execution is 32 cases/142 expects. Earlier 282 counted nested expressions and is superseded.

1. **Service** — Context.Service + Service.of with owned live/test Layers for runtime, HTTP, native platform/storage/jobs, event delivery, scripted model/agent.
2. **Schema** — Snapshot schemas plus native descriptor/environment/job contracts; transferred types derive from schemas/contracts.
3. **Tagged Errors** — InvalidTestSnapshot is Schema.TaggedError translated to existing public TypeError; native errors retain identity.
4. **Error Management** — Effect.exit preserves original failures while attempting every acquired-prefix/sibling release; native public adapters squash original Cause.
5. **Data** — Native plain immutable records/structuredClone remain authoritative; adding Data equality/tags would change public value shape without a requirement.
6. **Observability** — Shared observeExecution/Stream gives bounded operation context/outcome/duration, including standalone mutations/admission/lifecycle.
7. **Metrics** — Owner-local registry service and shared operation outcomes/durations/workload; isolation/live-test evidence fixtures.
8. **Tracing** — Named Effect.fn workflows and shared spans; native execution-context bridge preserves existing agent/event trace identities.
9. **Logs** — Configured runtime-effect server logger with existing redaction, minimum level and sinks at owner boundaries.
10. **Fibers** — Admitted job/event work uses forkIn + separate owned worker Scope; caller interruption stops waiting, close/restart join actual native completion.
11. **PubSub** — Not added: deterministic observation needs latest-state Deferred notification, not independent broadcast messages; native event router owns fanout.
12. **Queue** — Native durable queue/router remains authoritative; explicit Deferred state notification replaces hidden polling. No new Effect queue is required for nonblocking native next/admission.
13. **Stream** — Native run observation is scoped Stream.unfold with terminal takeUntil and shared stream instrumentation; callback AbortSignal interrupts wait.
14. **Clocks** — Explicit deterministic clock supplies snapshots/IDs/retry lease time; bounded close deadline is an explicit host timer seam, not hidden domain wall-clock time.
15. **Concurrency** — Sequential native persistence/fanout/recovery transitions; Effect.forEach joins independent completion receipts and attempts every release.
16. **Caching** — Writable fake cache is authoritative storage with writes/TTL/increment/snapshots; getOrSet deduplication preserves backend semantics. No memo cache added.
17. **Scheduling** — Injected deterministic time and native durable retry/scheduler policy remain authoritative; an Effect Schedule would duplicate acknowledged retry state.
18. **Scope** — Root/fakes/model prefixes each register release before later acquisition; separate worker scopes retire after harness abort/join.
19. **RcMap** — Not applicable: helpers own isolated roots/generations, with no shared keyed borrower lifecycle to manage.
20. **AcquireRelease** — Layer acquisition registers root, fake/model, native generation and worker-scope release independently; failed prefixes close.
21. **Testing** — @effect/vitest domain suites, actual Bun compatibility suites and bounded real Bun subprocess fixtures; explicit replacement Layers use the same Service contract.
22. **Traits** — Not applicable: no trait/component model; existing typed service/native descriptor contracts suffice.
23. **Refs** — Owner-local Ref holds mutable domain ledgers; Deferred owns approvals and close/restart completion rather than resolver polling.
24. **Configs** — Explicit options and native defineEnv/resolveRuntimeEnv schema authority preserve generic inference; no ambient Effect Config/process.env acquisition is introduced.
25. **Platform Logger** — Reuses runtime-effect createLoggerLayer at owner acquisition; no logger/runtime allocated per operation.

API evidence reuses phase 1 verified read-only vendor implementation/tests/examples and installed Effect 4.0.0-rc.115 source; Sparse vendor gaps were disclosed, with installed source/inline documented examples used where relevant vendor files were absent. Additional owned-work fixes rechecked installed Context, Scope.make/close, Effect.forkIn/uninterruptibleMask/acquireRelease/onExit/exit, Deferred.make/makeUnsafe/await/done/succeed, Fiber.join and Ref signatures. Existing RELKIT native durable queue/router/engine/SDK APIs remain Promise seams, with decisions and lifetime ordering in Effect. Drizzle/BetterAuth use the root-owned additive isolated activation support; no pins/vendor edits by this lane.

Independent reviewer: `/root/client_baseline`; refreeze awaits reread and signoff. No tests or authors running in this lane. No OpenSpec tasks marked and no Git operations.

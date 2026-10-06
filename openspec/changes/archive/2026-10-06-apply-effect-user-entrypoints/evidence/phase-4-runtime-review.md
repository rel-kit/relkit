# Runtime integration independent review

Independent reviewer: coordinator. Author: native-gate author. Final full-source reads and deterministic rereview are complete for this slice. Phase-four combined integration acceptance remains open until the other CLI domains are integrated.

## Complete reviewed TypeScript coverage

Twelve pure emitters: commands/build-server.ts, build-server.types.ts, build-server-bootstrap.ts, build-server-options.ts, build-server-http.ts, build-server-http-inspector.ts, build-server-invocation.ts, build-server-native-worker.ts, build-server-registration.ts, build-server-runtime.ts, build-server-runtime-support.ts, build-server-shutdown.ts.

Nine typed lifecycle leaves: server-runtime/runtime-environment.ts, runtime-cleanup.ts, runtime-resources.ts, runtime-shutdown.ts, runtime-workers.ts, server-runtime-host.ts, server-runtime.schemas.ts, server-runtime.service.ts, server-runtime.types.ts. One pure private barrel: internal/server-runtime.ts.

Six complete test/acceptance files: tests/server-runtime/runtime-test-layer.ts, lifecycle.test.ts, concurrency.test.ts, host.test.ts, type-probes.test.ts, standalone.acceptance.ts.

Supporting assertion updates reviewed in full: packages/cli/build-server.test.ts and specialized-logging.test.ts. The two source assertions now locate delegated orchestration and relocated bootstrap declarations; actual native behavioral coverage remains intact.

Total: **30 TypeScript files**, including all 28 author-owned runtime/emitter files and two supporting test changes.

## Findings and verified resolutions

1. Shutdown leader election is masked through Deferred completion publication; cancelled leaders cannot strand followers.
2. Resource, worker, retry and per-item batch admission closes at stopping. Late acquisitions release exactly once, initialization and retry physical receipts drain before their handles release.
3. Worker defects are recorded and terminate the loop; expected recoverable failures retain evidence and preserve existing polling cadence.
4. Standalone operations use shared observation and the configured structured logger, annotations and minimum level.
5. Schema-derived named types are in the type companion; strict examples and negative service/environment/callback authority probes are present.
6. Native finalizers restore interruptibility and implement their own deadline. An outer timeout cannot bound arbitrary masked Scope.close finalizers.
7. Interrupted waiters retain physical receipts; settlement removes them without waiting until shutdown.
8. Evidence is bounded to the first and 31 recent failures, independently of sink retention.
9. Throwing late diagnostic sinks cannot replace cancellation or cleanup evidence, including after disposal.
10. Retry callback physical completion is tracked before await, so stalled readiness drains before worker handle release.
11. Bounded batches retain the first observed failure rather than first input-order failure; siblings settle before reporting.
12. Standalone subprocess acceptance has five-second graceful shutdown, SIGKILL fallback and a bounded physical exit wait.

No unresolved substantive finding in this slice. Resources have one explicit generation owner. No Cache/RcMap is added for unique handles; Ref/Deferred/Scope/structured fibers fit these lifetimes.

## Actual reviewer verification

- `rtk bunx vitest run packages/cli/tests/server-runtime --maxWorkers=1`: **25/25 passed**, reviewer rerun, 7.83 seconds. Includes strict skipLibCheck:false negative service/layer probes and deliberately stalled cleanup/retry tests.
- Author evidence: actual generated database/auth/product/environment/correlation/specialized logging acceptance **7/7 passed**, plus actual standalone production bundle readiness and SIGTERM exit zero without workspace links. These remain recorded in phase-4-runtime-implementation.md; final combined acceptance still required.
- Full EOF reads of emission, private service contracts and six tests completed; no generated application source adopts internal Effect services.
- Supporting test edits retain all other fingerprint, secret-output and minimum-level assertions.
- Final shared runner compiler replay also passed: valid captured Context and ManagedRuntime calls compile, while four negative synchronous/asynchronous calls reject missing service authority. No public runner erases its required environment.

## Effect reference provenance

The read-only vendor checkout lacks core Effect, Scope, ManagedRuntime, Context, Ref, Deferred, Schedule and Schema implementations/tests. Installed Effect 4.0.1 implementations and embedded examples are the compatibility authority. Exact upstream release Scope/ManagedRuntime/Effect tests were inspected for absent vendor coverage.

- [Scope 4.0.1 tests](https://github.com/Effect-TS/effect/blob/effect%404.0.1/packages/effect/test/Scope.test.ts)
- [ManagedRuntime 4.0.1 tests](https://github.com/Effect-TS/effect/blob/effect%404.0.1/packages/effect/test/ManagedRuntime.test.ts)
- [Effect 4.0.1 tests](https://github.com/Effect-TS/effect/blob/effect%404.0.1/packages/effect/test/Effect.test.ts)

Installed internal/effect.ts confirms masked Scope.close, release registration before acquisition exposure and Cause.squash at Promise edges. No vendor files were edited or installed.

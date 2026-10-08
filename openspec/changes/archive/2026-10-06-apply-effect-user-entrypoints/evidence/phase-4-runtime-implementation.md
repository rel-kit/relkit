# Emitted runtime implementation and verification

Author: native_gate. Independent reviewer: coordinator (see phase-4-runtime-review.md).
Implementation remains in the candidate worktree; synchronization and combined acceptance are
coordinator-owned gates and are not claimed complete here.

## Classification and ownership

All twelve `packages/cli/src/commands/build-server*.ts` files are pure source-emission adapters:
`build-server.ts`, `build-server.types.ts`, `build-server-bootstrap.ts`,
`build-server-options.ts`, `build-server-http.ts`, `build-server-http-inspector.ts`,
`build-server-invocation.ts`, `build-server-native-worker.ts`, `build-server-registration.ts`,
`build-server-runtime.ts`, `build-server-runtime-support.ts`, and `build-server-shutdown.ts`.
They preserve generated RELKIT descriptors, HTTP/health/status output, readiness conditions,
structured logging, request correlation, redaction and signal exit status. Lifecycle orchestration
is delegated to compiled typed code through the intentional `@relkit/cli/internal/server-runtime`
export; emitted strings introduce no new unverified Effect orchestration.

Nine implementation/contract leaves under `packages/cli/src/server-runtime/`:
`runtime-environment.ts`, `runtime-cleanup.ts`, `runtime-resources.ts`,
`runtime-shutdown.ts`, `runtime-workers.ts`, `server-runtime-host.ts`,
`server-runtime.schemas.ts`, `server-runtime.service.ts`, and `server-runtime.types.ts`.
`packages/cli/src/internal/server-runtime.ts` is a pure export barrel.

Six tests/acceptance leaves under `packages/cli/tests/server-runtime/`:
`runtime-test-layer.ts`, `lifecycle.test.ts`, `concurrency.test.ts`, `host.test.ts`,
`type-probes.test.ts`, and `standalone.acceptance.ts`.
Total author coverage: 28 TypeScript files. Implementation leaves remain below 250 lines.

One ManagedRuntime generation owns the environment, resources, workers and physical-completion
receipts. Baseline Ref state exists before startup. Readiness and shared shutdown use Deferred;
startup and serial polling/retry fibers are scoped. Independent legacy-job callbacks are bounded
to sixteen and settle siblings before preserving the primary failure. History retains the first
failure and recent evidence within 32 entries. Cache/RcMap were considered and are inappropriate
for unique generation-owned handles; no cross-generation cache was added.

## Reviewed findings resolved

- Shutdown leader election and completion now form one masked protocol, preventing interrupted
  leaders from leaving followers waiting forever.
- Resource/worker/retry admission rejects stopping generations. In-flight acquisition and
  initialization belong to the worker scope; uncancellable native completion is drained before
  releasing the handle. Late acquisition is released exactly once without publishing it.
- Each native release restores interruptibility inside its own deadline. An outer Scope.close
  timeout cannot bound an arbitrary uninterruptible finalizer.
- Worker defects are reported once and terminate that loop; typed recoverable failures retain
  bounded evidence and allow the next scheduled pass. Polling retains the existing cadence.
- Interrupted waiters retain physical completion receipts which remove themselves on later
  settlement; settled work cannot accumulate until shutdown.
- Every independently callable service operation uses the shared execution observer. Logger
  authority and generation annotations are provisioned through the managed layer context.
- Throwing diagnostic sinks cannot replace native primary/cancellation failures; late cleanup
  failure evidence remains visible after host disposal.
- RuntimeArea/RuntimeSnapshot and emitter named contracts live in type companions. Public
  operation documentation includes parameters/results, and the provisioning example is compiled.
- A real generated host exposed block-scoped bootstrap helper visibility; environment/token
  helpers now emit before the owned startup block.

## Actual verification

- `rtk bunx vitest run packages/cli/tests/server-runtime --maxWorkers=1`: **25/25 passed**,
  including strict `skipLibCheck:false` compiler probes. The mutation removing live-layer
  environment requirements is rejected, as are missing service and foreign callback authority.
  Log: `/tmp/relkit-server-runtime-tests.log` (8.12 seconds).
- Focused strict CLI helper declaration emit passed with no diagnostics. Command uses ES2022,
  Bundler resolution, noUncheckedIndexedAccess, exactOptionalPropertyTypes and verbatimModuleSyntax;
  normal workspace declaration emit retains its established skipLibCheck setting. This does not
  replace the stricter consumer probes.
- Generated database/auth host acceptance passed: transactions/rollback, sessions, ownership,
  graceful shutdown and secret redaction. Full graph agent/correlation runtime and production
  required-environment rejection also passed. Final combined invocation has **7/7 passed** in 9.32
  seconds, including specialized debug sinks and emitter fingerprint checks. Earlier failures in
  stale extraction/polling source assertions were resolved by the separate CLI author; the
  coordinator independently reviews those assertion changes.
  Log: `/tmp/relkit-generated-runtime-native.log`.
- `rtk bun packages/cli/tests/server-runtime/standalone.acceptance.ts`: **passed**. Actual production
  bundle copied to a fresh directory without node_modules/workspace links, private runtime import
  resolved inside the bundle, HTTP readiness succeeded, and SIGTERM exited zero.
  Graceful exit is bounded to five seconds with a SIGKILL fallback and a two-second physical-exit
  deadline; failed acceptance cleanup is also bounded.
  Log: `/tmp/relkit-server-runtime-standalone.log`.
- Own source/test/emitter Prettier formatting completed. Final repository guards and package-wide
  checks remain part of coordinator integration acceptance.

## Effect reference provenance

Installed Effect 4.0.1 sources and examples were inspected for Context/Layer, Ref, Deferred,
acquireRelease, Scope.fork/close, forkIn/join, ManagedRuntime, Config, Schedule and timeout behavior.
The ignored vendor reference lacks the corresponding core implementations/tests. That gap was
recorded rather than assumed equivalent. Exact upstream 4.0.1 Scope and ManagedRuntime tests
provided by the coordinator were read in full from `/tmp/relkit-effect-4.0.1-Scope.test.ts` and
`/tmp/relkit-effect-4.0.1-ManagedRuntime.test.ts`: direct close/disposal remains masked, completes
remaining finalizers after interruption/defect, and disposes request fibers before layer resources.
The installed implementation is the compatibility authority for this candidate.

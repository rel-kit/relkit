# Observability Better Pkg audit

Status: **in progress**. Passing tests and coverage is not a claim that this
package satisfies every Better Pkg requirement.
Current verification: 61 package Vitest files and 166 tests pass. V8 coverage
is 90.75% statements, 81.12% branches, 92.06% functions, and 92.93% lines.
The package build, repository typecheck, aggregate package tests, source export
guard, Prettier check, and file-size/coverage gate pass. Konsistent validates;
its 106 remaining diagnostics are outside `packages/observability`.

## Verified in this pass

- The local batch queue retains records across an interrupted drain, bounds
  accepted bytes and background drain tasks, owns its timer, and forwards
  cancellation to the remote HTTP writer. Queue Effect and adapter paths have
  regression tests.
- Local and remote runtimes retain asynchronous exporter failures until flush.
  Exporter fanout validates static metadata before acquisition and bounds lane
  dispatch and pending failure notifications.
- DuckDB acquisition and operations run through Effect services. The database
  Layer owns the instance and connection in one Scope; the Promise adapter keeps
  its Scope alive until close. Tests cover normal release, failed connection and
  schema setup, deferred interruption, transaction rollback, query error codes,
  and single-connection serialization. The legacy importer uses Effect-managed
  read streams and stable receipts. Worker listeners and timer are scoped.
- `bun run test:coverage` enforces aggregate V8 thresholds and checks that every
  included runtime module has executed lines, a 60% line and 50% function floor
  for modules other than the tested process entrypoint, every authored TypeScript
  file is at most 200 lines, and package tests live under `tests/`.
- Remote request cancellation now aborts the fetch signal during response body
  parsing, with a test interrupting the exported Effect operation.
- Direct export uses a bounded 1,024-record waiting queue and at most 16 scoped
  workers. Overload and asynchronous callback failures surface through flush,
  and Layer interruption reaches the callback's optional AbortSignal.
- The request-record builder has an observed Effect path, a synchronous adapter,
  a substitutable Effect clock, and tagged invalid-time failures. Internal type
  declarations moved to sibling `.types.ts` files in the affected modules.
- Stream cursor, bound, and event-type utilities now delegate to observed Effect
  operations with tagged failures; tests cover adapter error compatibility and
  success and failure metrics.
- Query validation, matching, time-range, and response helpers now delegate
  through observed Effect operations. Query input failures are tagged in Effect
  and retain their existing `ObservabilityQueryError` adapter codes.
- Record admission and admission-brand checks now have observed Effect paths;
  the collector Effect path calls admission directly, and tests cover tagged
  redaction failures, adapter compatibility, and success and failure metrics.
- Redaction policy, record, and capture operations now expose observed Effect
  paths with tagged policy errors. Collector capture and admission use those
  Effects directly; the public synchronous APIs preserve their behavior.
- Execution assembly, span coalescing, and current-trace selection have observed
  pure Effect paths with synchronous adapters and direct metric tests.
- Telemetry configuration normalization, exporter descriptors, and descriptor
  checks have observed Effect paths, tagged validation errors, adapter tests,
  and success and failure metrics.
- Collector event, record, and value conversion helpers now have observed
  Effect operations and synchronous adapters. Collector emit calls the Effect
  event path directly; tests cover all converter families and outcome metrics.
- Query page, cursor, collection, and safe-read helpers now use a substitutable
  index service, typed read failures, and observed Effect operations. Promise
  adapters preserve query validation errors and underlying index failures.
- Public local query creation and all request, log, and trace operations now
  delegate to Effect implementations. Detail reads remain sequential to keep
  the established first-error order; direct Effect tests cover the index Layer,
  tagged construction failure, and operation metrics.
- Stream consumers now have Effect queue, read, close, and stats operations,
  plus a scoped Layer that closes pending reads on interruption. The adapter
  retains its async iterator and public error behavior.
- The stream owner now exposes observed, tagged Effect operations and a scoped
  service Layer. The synchronous API delegates through that path; tests cover
  error compatibility, success and failure metrics, and interruption closing
  a pending consumer. The core now uses pure validation, redaction, and
  admission functions inside the Effect boundary, preserving the shared
  admission brand without nested compatibility adapter calls.
- Exporter lane acquisition, flush, and release now use bounded Effect
  traversal (16 lanes) with deterministic tests for acquisition and flush
  limits and sorted output order. The fanout exposes a tagged, observed Effect
  service and Layer, and the Promise API delegates through it. Tests cover
  metadata failure, operation metrics, and interruption releasing lanes.
  Interrupting acquisition forwards an AbortSignal to factories, closes lanes
  already acquired, and closes a late result from a factory that ignored abort;
  an exported-Effect interruption test covers all three paths.
  Individual lane creation, dispatch, flush, and settlement now expose
  observed Effect operations with Promise/synchronous adapters. The fanout
  remains the lane resource owner. Fanout and lane cores now call shared core
  resolution and lane functions directly instead of starting nested adapter
  runtimes. Direct tests exercise all four lane compatibility adapters.
- Exporter metadata validation, binding resolution, and runtime factory calls
  now have observed Effect paths with tagged failures and Promise/synchronous
  adapters. Factory interruption forwards abort and releases late handles;
  direct Effect and fanout interruption tests cover both entry points.
- The local index and segment store now expose observed Effect services and
  scoped Layers. Their Promise APIs delegate through the same operations,
  retaining original causes at the compatibility boundary. Tests cover typed
  failures, operation outcomes, adapters, and Scope exit release. Filesystem
  operations are non-cancellable once started, so their Effect bridges wait
  for completion before honoring interruption and closing handles.
- Segment bound, signal discriminator, and calendar-day utilities now have
  observed Effect paths, tagged bound/time failures, and compatibility tests.
  The segment owner calls the pure core functions within its Effect boundary.
- Segment filesystem operations now expose observed Effect paths, tagged IO
  failures, and Promise adapters. Tests cover atomic replacement, line append,
  listing, validation compatibility, and outcome metrics. Tests directly cover
  every compatibility adapter. Repair uses shared pure redaction and admission
  logic within the Effect boundary. The segment and index owners call that core
  directly, avoiding nested Effect runtimes and duplicate metrics.
- Index file scanning has observed Effect paths and compatibility adapters for
  scanning and path helpers. Interruption reaches the file read signal and
  stops callbacks after the current visitor settles. Visitor failures now
  propagate as tagged Effect errors and preserve the original adapter error;
  malformed record tails still stop scanning.
- Index retention, trace paging, state validation, and mutable memory operations
  now expose observed Effect paths with tagged failures and synchronous or
  Promise adapters. Tests cover all adapter families, state mutation, invalid
  options, and success and failure metrics. The index owner calls their core
  functions directly within its existing Effect operation.
- The top-level runtime acquisition and release now have an observed Effect
  service and Layer; the Promise factory delegates through acquisition.
  Interruption closes the runtime-owned stream. Its record, query, and flush
  operations still run through Promise/synchronous core code, so this is not
  a completed runtime conversion.
- Standalone remote runtime acquisition and release now have an observed
  Effect service and Layer. Tests cover tagged configuration failure, metrics,
  and interruption closing the remote runtime's stream. Remote record, query,
  and queue operations still need direct Effect composition.

## Remaining conversion work

The following runtime modules still contain executable operations without a
complete Effect implementation. Pure calculations need an Effect entry point
but generally do not need a service; resource owners need a scoped service or
Layer and release tests. Each module also needs an export-by-export TSDoc and
test audit before it can be checked off.

| Capability            | Modules to finish                                                                                                                                                 |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Query and stream      | Stream boundary converted; final export-by-export TSDoc and branch audit remain.                                                                                  |
| Runtime and telemetry | `runtime-core.ts`, `remote-runtime-core.ts`, `telemetry-exporters-core.ts` (runtime operations and fanout traversal still start their own Effect runtimes)        |
| Index and segments    | Owner operations are Effect-backed; final export-by-export TSDoc, branch, and lifecycle audit remains for `storage/index-core.ts` and `storage/segments-core.ts`. |

This inventory is based on authored modules that still perform work outside an
Effect boundary. It does not exempt already converted modules from the final
operation-by-operation audit. Current coverage exercises each runtime file but
does not prove every branch or lifecycle path. In particular, remote runtime,
DuckDB query detail branches, and query paging still need more behavior tests.
`query-types.ts` and `stream-types.ts` contain protocol constants and documented
compatibility error constructors; their Effect paths report tagged domain errors.
DuckDB's native Promise API has no cancellation signal, so SQL and connection
acquisition finish before interruption releases their handles; this preserves
resource safety when an in-flight native operation cannot be cancelled.

Before marking this audit complete, enumerate each executable export, document
its Effect success and error channels, test its compatibility adapter and
telemetry, and verify release on success, failure, interruption, partial
acquisition, and repeated disposal where applicable. For concurrent operations,
verify limits, ordering, and cancellation. Then rerun package coverage,
typecheck, build, aggregate package tests, source scans, and konsistent.

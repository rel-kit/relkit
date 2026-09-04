## 1. Contracts and canonical records

- [x] 1.1 Create and strictly validate the OpenSpec proposal/specs/design/tasks and record the clean break in an ADR.
- [x] 1.2 Implement portable strict W3C IDs, parsing/injection and detached propagation envelopes with malformed-input tests.
- [x] 1.3 Replace canonical records with model v2 starts/updates/completions and operation signals; update producers/readers/validators/config together, removing timelines and legacy readers.
- [x] 1.4 Implement configurable capture limits, bounded metadata and dropped counters with completion-preservation tests.

## 2. Shared runtime lifecycle

- [x] 2.1 Extend the existing invocation carrier; move the reusable span primitive there with immutable context, active registry and failure isolation.
- [x] 2.2 Bridge Effect tracer context and dynamic operation parentage; test nesting, concurrency, timers, resumed fibers and generation isolation.
- [x] 2.3 Enclose complete invocation lifecycle through normalized outcome before release, preserving recursion/admission/cancellation/error semantics.
- [x] 2.4 Expose ctx.trace through function, middleware and standalone contexts; verify manual span results/errors and no-op behavior.
- [x] 2.5 Correlate all logs at write time including generated/standalone/Effect/middleware paths and remove development-only behavior.

## 3. HTTP and host

- [x] 3.1 Implement shared outermost HTTP boundary and generated Bun integration including early responses and self-observation exclusions.
- [x] 3.2 Instrument inclusive authored middleware and executed route/mapping/validation/hook events with no fabricated stages.
- [x] 3.3 Observe body termination exactly once with backpressure and cancellation preserved; test real Bun streaming, HEAD/bodyless, abort and shutdown.

## 4. Managed operations and clients

- [x] 4.1 Unify cache/bucket operation spans and remove duplicate bridge spans.
- [x] 4.2 Instrument Drizzle logical operations/transactions, overrides and recovery; verify cached activation context and generation isolation.
- [x] 4.3 Replace agent/model/tool synthetic spans and bind actual callbacks, parallel calls and approvals.
- [x] 4.4 Add Bun-conditioned server RELKIT client spans/header propagation and prove browser bundle safety and untouched bodies.

## 5. Durable work

- [x] 5.1 Create event/job producer spans and capture propagation inside acceptance boundaries separately from payloads.
- [x] 5.2 Persist propagation through local queue transitions, restart/retry/replay/admin retry/idempotency and generated/testing providers.
- [x] 5.3 Wire AWS EventBridge/SQS propagation with mocked round-trip coverage and malformed-metadata fallback.
- [x] 5.4 Add detached consumer attempts and acknowledgement-owned completion, scheduled roots and controlled-worker assertions.

## 6. Execution queries and Inspector

- [x] 6.1 Add request/trace/origin/span segment indexes and equivalent DuckDB columns/indexes with retention coverage.
- [x] 6.2 Share bounded execution assembly across stores/remote; coalesce authoritative records and handle missing parents/cycles/truncation.
- [x] 6.3 Replace request detail at existing URL, separate persistence/export waits and publish bounded live notifications/reconnect state.
- [x] 6.4 Extend waterfall with active spans, lifecycle event markers, concurrent branches and separate async continuations.
- [x] 6.5 Add selected-span metadata/events/links/logs/errors, preserve selection, relevant live refresh, independent trace browsing and generation-safe source links.

## 7. Export and safety

- [x] 7.1 Export valid OTLP/HTTP JSON completed spans/logs, events/links/resources, without domain duplicates or updates.
- [x] 7.2 Apply deterministic trace-level sampling to logs/errors; retain Collector tail sampling guidance without local tail buffering.
- [x] 7.3 Isolate persistence/export failures, queue overflow and bounded shutdown; test privacy and no self-observation loops.

## 8. Acceptance and release

- [x] 8.1 Add commerce causal flow, declared retry after invoice bucket failure, agent/tools and outgoing-client acceptance.
- [x] 8.2 Add paused live HTTP Inspector browser scenarios, failures/timeouts/cancellation, reconnect, direct trace and truncation coverage.
- [x] 8.3 Update documentation/public API examples/generator sources, regenerate outputs through repository commands and add coordinated changesets.
- [x] 8.4 Measure baseline versus instrumented HTTP/operation/query/heap performance and investigate review thresholds.
- [x] 8.5 Run strict OpenSpec, focused Bun suites, boundaries, typecheck, diff checks, verify, restart/integration/security, generated-project and Inspector browser tests; record unavailable checks explicitly.

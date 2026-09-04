# Automatic Runtime Instrumentation — Clean Implementation Plan

## Context

See proposal.md for motivation. The reviewed baseline is 484fd989ccd8f2cded8f89744eb753e7516535d0; 13 focused tracing/engine/HTTP tests passed during review. Invocation already owns AsyncLocalStorage; runtime-effect owns a partial custom tracer; Hono builds completed request timelines by scanning records. Generated Bun early responses bypass Hono. Drizzle activations are cached. Local segments and DuckDB have different detail assembly. These existing paths must converge without adding dependencies.

## Goals / Non-Goals

Goals: one causal execution model, portable propagation, generation-isolated recording, live bounded inspection and correct failures. Reuse the current runtime, providers, stores, stream and waterfall.

Non-goals: arbitrary JavaScript tracing, global fetch/SDK patching, a new exporter/backend, in-process tail sampling, verbose boundary toggles, compatibility formats, migration tooling or deleting existing state. The supplied reference document remains reference, not another task checklist.

## Decisions

1. Put W3C identifiers, span context and durable propagation in contracts. Extend invocation's existing immutable ambient scope, keeping dispatcher/call-stack context. Move the low-level span primitive there and keep Effect adapter/collector wiring in runtime-effect. Effect's tracer context hook bridges the current fiber span into Promise execution; clients resolve context at call time. A competing context manager would break nesting. Explicit parent wins; parentSpanId is independent from optional parentInvocationId.
2. Use generation-owned recording state with bounded active spans and observer isolation. Closing a generation completes/abandons its own recording but never disables the shared carrier. Names/keys and scalar metadata are bounded; spans keep propagation when recording is dropped. Updates carry monotonic revision, and terminal snapshots are authoritative even after update limits.
3. A single outer HTTP wrapper owns fresh request identity and server-span completion; nested Hono reuses it. Wrap generated Bun fetch before health/readiness/draining branches. Exclude telemetry endpoints/transports. Authored middleware is inclusive; instantaneous stages are events and only emitted when executed. Observe body EOF/error/cancel/abort/shutdown once via pull-based wrapping; HEAD/bodyless complete immediately. No header heuristic or request-finish store scan.
4. Invocation lifecycle spans begin before input validation/admission and end after normalized completion, before release. Common contexts expose dynamic ctx.trace. Logs resolve current identifiers at write time, independent of development mode. Observers never rerun or replace application work.
5. One operation runner covers cache, bucket and Drizzle logical operations. Internal recovery/transaction mechanics are not duplicate operations. Transaction callbacks activate their parent until commit/rollback. Cached activation cannot close over request context or generation sinks. Agent/model/tool callbacks and approval work activate real spans. Bun-conditioned client entry injects W3C metadata and completes at headers; default/browser stays runtime-free.
6. Producer spans encompass validation/acceptance and capture propagation inside the span. Consumers are detached roots linked to producer context; request/origin identity is informational, never request cancellation/deadlines. Persist propagation separately from payload through all local/AWS/test/generated transitions. Keep original metadata on idempotent duplicates. Ack-owning component owns consumer completion; handler-only cloud adapters explicitly say so. Scheduled work has no request identity.
7. Replace the record format wholesale with v2, request starts/completions and span starts/updates/completions; operation replaces resource. Defaults: 512 spans/trace, 64 attributes, 32 events, 64 links, 64 updates/span, 1024 bytes/value, 4096 recording spans/runtime. No persisted timeline. Replace all readers/producers/validators/config/test fixtures together, not a v1/v2 union.
8. Add real lookup maps to segment index and equivalent DuckDB columns/indexes for request/trace/origin/span. Share bounded assembly for segment/DuckDB/remote. Existing request URL returns RequestExecutionDetail. Coalesce by request or composite span identity; prefer completed then highest revision. Limit 2000 records, 100 continuation traces, depth 64, with explicit incomplete reasons, missing parents and cycles. Queries await local persistence only. Stream emits bounded updates; reconnect reloads canonical state.
9. Reuse Inspector's waterfall with point events and selected-span identity instead of stale selected objects. Keep independent trace browsing, logs distinct from events, async continuations distinct from HTTP, and explicit safe details/dropped counts. Filter live refresh to relevant identities. Resolve source only for matching generation/graph.
10. Existing OTLP queue exports complete spans/logs as OTLP/HTTP JSON, never synthesized domain duplicate spans. Deterministic hash sampling applies to all trace-associated records, including errors. Collector tail sampling uses traceRate 1. Redact before every sink, capture no automatic payload/SQL values/keys/prompts/query strings/raw dynamic paths. Isolate local persistence/export promises and bound shutdown.

## Risks / Trade-offs

- Broad clean break → coherent producer/reader/config changes, strict typechecking and fresh-state diagnostics; never silently migrate user state.
- Runtime/body instrumentation can alter semantics → real Bun streaming, disconnect and backpressure regression tests, including double-wrapper and early-host paths.
- ALS and Effect disagreement → concurrent nested/parallel/resumed-fiber tests before adding boundaries.
- Bounded data cannot imply complete observation → explicit dropped/incomplete counts in query/UI, authoritative completion snapshots.
- Async continuations outlive request → separate consumer traces with stable links and indexed origin discovery; do not stretch server spans.
- Instrumentation overhead → baseline HTTP, operation-heavy, query and heap measurements; investigate median >5% or p95 >10%, not guarantees.

## Migration Plan

Implement by tasks.md milestones and focused tests, then coordinated changesets, docs and regenerated outputs using repository commands. No legacy queue/telemetry support. Users choose fresh development state after incompatibility diagnostics. No commits, push, paid cloud tests or deletion without separate authorization. Record all unavailable checks; completion requires strict OpenSpec validation, verify, restart/integration/security, generated-project and Inspector browser acceptance.

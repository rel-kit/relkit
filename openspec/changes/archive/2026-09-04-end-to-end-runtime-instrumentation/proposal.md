# Automatic Runtime Instrumentation — Clean Implementation Plan

## Why

RELKIT records individual operations but cannot reliably reconstruct a request from HTTP arrival to body completion and subsequent durable work. Developers need one live, bounded, secret-safe execution graph, including selectable spans and their attributes in Inspector.

## What Changes

- Extend the existing invocation carrier with execution context and a shared span lifecycle, including public `ctx.trace` and write-time log correlation.
- Instrument HTTP, middleware, full invocation lifecycle, resources/database, tools/agents, and server-side RELKIT clients automatically.
- Propagate causation separately from event/job payloads; consumers create linked traces without request cancellation.
- **BREAKING**: replace telemetry with model v2, replace resource signals with operations, remove persisted timelines and legacy format support, and return `RequestExecutionDetail` at the existing request-detail URL.
- Add indexed execution assembly, bounded live updates, and Inspector trace/span/request lifecycle navigation.
- Emit conforming OTLP traces/logs with deterministic trace-level sampling and isolated failures.
- Verify generated hosts, commerce, workers, browser behavior, privacy, restart, and performance; document the clean break without deleting user state.

## Capabilities

### New Capabilities

None; existing capabilities own the feature.

### Modified Capabilities

- `observability`: canonical v2 records, limits, propagation, indexes, live assembly, OTLP and sampling.
- `http-runtime`: outermost HTTP ownership, full observable response lifecycle and outbound clients.
- `function-runtime`: complete invocation spans and asynchronous context preservation.
- `managed-resources`: logical resource/database/transaction spans.
- `jobs-events`: durable producer/consumer links and detached attempt contexts.
- `tools-agents`: real lifecycle spans for agents, models, tools and approvals.
- `public-authoring`: the single `ctx.trace` API.
- `development-inspector`: live request lifecycle, trace browsing and selected-span detail.
- `acceptance-verification`: relationship, browser, failure, generated-host and performance evidence.

## Impact

Contracts, invocation, Effect/Hono runtimes, engine, resource and worker providers, AWS transports, agent/tool adapters, client conditional exports, observability storage/query/export, Inspector, CLI generator sources, tests and docs change together. No new dependency, backend or migration tool is introduced. Existing state is preserved; incompatible state receives an explicit diagnostic.

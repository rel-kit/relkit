# RelKit Automatic Runtime Instrumentation

## Codex Implementation Plan

| Field | Value |
| --- | --- |
| Status | Proposed implementation plan |
| Audience | Codex and RelKit maintainers |
| Feature name | Automatic Runtime Instrumentation |
| Original working name | Auto Annotations |
| Recommended OpenSpec change ID | `end-to-end-runtime-instrumentation` |
| Repository | `rel-kit/relkit` |
| Baseline reviewed | `484fd989ccd8f2cded8f89744eb753e7516535d0` |
| Baseline date | 2026-09-03 |
| Runtime | Bun 1.3.10, strict TypeScript, Hono, Effect |
| Primary outcome | One request-centric causal execution graph across HTTP, middleware, functions, database, cache, buckets, events, jobs, tools, agents, logs, and failures |

---

## 0. How Codex must use this document

This document is an implementation work order. It is not permission to implement the whole feature in one unreviewable change.

Before changing source code, Codex must:

- [ ] Read the repository root `AGENTS.md`.
- [ ] Read every more-specific `AGENTS.md` under a directory being modified.
- [ ] Read `.agents/skills/opentelemetry/SKILL.md` and its relevant references.
- [ ] Read `.agents/skills/konsistent-config/SKILL.md` before changing exports, imports, package boundaries, directories, or naming.
- [ ] Read the Hono and Effect repository guidance before changing runtime integration code.
- [ ] For `apps/inspector`, read the installed Next.js documentation required by `apps/inspector/AGENTS.md` before writing code.
- [ ] Run `git status --short` and inspect all overlapping user changes. Never reset, discard, or overwrite unrelated work.
- [ ] Confirm that the current branch still resembles the baseline described here. Search by symbol if a file moved.
- [ ] Run `openspec list`, inspect active changes, and verify that no overlapping instrumentation proposal has appeared.
- [ ] Create and strictly validate the OpenSpec change described in Phase 0 before substantive implementation.
- [ ] Use Bun commands only. Do not substitute npm or pnpm.
- [ ] Keep implementation files at or below the repository's 200-line limit by splitting responsibilities.
- [ ] Prefer existing primitives over introducing a competing tracing, storage, logging, or query stack.

The required working style is:

1. Implement one mergeable phase or pull request at a time.
2. Add tests before or with each behavior change.
3. Keep existing behavior passing while migrating consumers.
4. Run focused tests during iteration.
5. Run the full required verification gates before declaring the change complete.
6. Record intentionally deferred work in OpenSpec rather than silently omitting it.

Do not hand-edit generated files under `.relkit/generated`, `.relkit/build`, generated API references, or generated clients. Change the source generator and regenerate through repository commands.

---

## 1. Goal

RelKit must automatically capture the causal lifecycle of work initiated by an inbound request or another runtime trigger.

A developer looking up a request must be able to answer:

- Where did the request enter the service?
- Which middleware ran, in which order, and for how long?
- Which route and function handled it?
- Which nested functions were called?
- Which database, cache, storage, event, job, tool, agent, and outbound operations were touched?
- Which operation failed, timed out, was cancelled, retried, or dead-lettered?
- Which logs belong to each operation?
- What completed before the HTTP response?
- What continued asynchronously after the HTTP response?
- Which source descriptor and runtime generation produced the behavior?

The developer experience must require no tracing boilerplate for RelKit-owned APIs.

```ts
export const createOrder = defineFunction({
  id: "orders.create",
  input: CreateOrderInput,
  output: CreateOrderOutput,
  publishes: [orderCreated],
  dependencies: {
    cache: { orders: orderCache },
    buckets: { receipts: receiptBucket },
    jobs: { invoice: invoiceJob },
  },
  handler: async (input, ctx) => {
    const order = await ctx.database.orders.insert({ data: input });
    await ctx.cache.orders.delete(order.id);
    await ctx.events.orderCreated.publish({ orderId: order.id });
    await ctx.jobs.invoice.enqueue({ orderId: order.id });
    return order;
  },
});
```

The runtime must automatically produce a structure similar to:

```text
POST /orders                                      SERVER
├── middleware auth.require-user                  INTERNAL
├── middleware orders.rate-limit                  INTERNAL
└── function orders.create                        INTERNAL
    ├── INSERT orders                             CLIENT
    ├── cache delete orders                       CLIENT or INTERNAL
    ├── publish order.created                      PRODUCER
    └── enqueue invoice.generate                   PRODUCER

continued after response
├── process order.created                          CONSUMER
│   └── function analytics.track                  INTERNAL
└── process invoice.generate attempt 1             CONSUMER
    └── function invoice.generate                  INTERNAL
```

The product outcome is not “put the same request ID on every log line.” The product outcome is a **causal execution graph** built from spans, links, records, and stable identities.

---

## 2. Non-goals for the first complete release

The following are explicitly outside the first implementation unless a later OpenSpec amendment adds them:

- Instrumenting every arbitrary JavaScript or TypeScript function.
- AST rewriting of user handlers to insert spans.
- Monkey-patching every third-party SDK.
- Global `fetch` monkey-patching.
- Capturing request bodies, response bodies, function input/output values, SQL parameters, event payloads, job payloads, cache values, or bucket contents.
- Creating a second application graph for telemetry.
- Replacing Effect as the internal execution kernel.
- Replacing the existing observability collector, segment store, index, query protocol, or exporter fan-out.
- Requiring application developers to import OpenTelemetry, Effect, Hono, or an observability vendor SDK.
- Metrics redesign. Trace-derived metrics may be considered later.
- Full vendor-specific tracing for every database or cloud SDK in the initial release.
- Treating arbitrary incoming request IDs or RelKit correlation headers as trusted by default.
- Keeping an HTTP span open until asynchronous events or jobs finish.

“Automatic” means every **RelKit-owned logical runtime boundary** is instrumented. Arbitrary libraries called directly by application code require one optional explicit business span.

---

## 3. Current baseline and gaps

The implementation must extend the current architecture instead of duplicating it.

### 3.1 Existing foundation

The reviewed baseline already contains:

| Area | Existing behavior |
| --- | --- |
| HTTP | `x-request-id` and `x-trace-id` middleware, request lifecycle hooks, request records, route/mapping/function timeline details |
| Invocation | Invocation IDs, trace IDs, parent invocation IDs, correlation IDs, deadlines, attempts, sources, cancellation, outcomes |
| Effect tracing | Root and child invocation spans, captured Effect trace re-entry, span lifecycle observation |
| Logs | Structured records that can include invocation, trace, span, request, correlation, generation, graph, and service fields |
| Resources | Cache and bucket operation bridges and operation hooks |
| Functions | Direct function calls inherit invocation scope and create child spans |
| Events | Publication carries trace ID, correlation ID, and causation invocation ID |
| Jobs | Enqueue and execution infrastructure with durable attempts and retries |
| Database | Centralized logical Drizzle operation and transaction interception points |
| Observability | Versioned records, redaction, bounded collector, local persistence, index, query, streaming, remote mode, exporters, sampling |
| Inspector | Existing requests, traces, logs, functions, middleware, events, jobs, and waterfall views |
| OTLP | Existing publishable OTLP integration with batching and exporter failure isolation |

### 3.2 Primary gaps

| Gap | Why it matters |
| --- | --- |
| `TraceId` is currently a generic stable ID | It cannot be safely injected as W3C `traceparent` without a compliant representation |
| HTTP has no actual server span | Function spans share a string trace ID but are not children of an HTTP span |
| HTTP parent and invocation parent are conflated | An HTTP span is not an invocation and must not require a fake parent invocation ID |
| Hono middleware is manually timed | Middleware is not represented as an active child span, so nested logs and operations do not inherit it |
| Request completion scans collected records | This does not scale and cannot naturally include late asynchronous continuations |
| Event delivery reuses trace identity without a producer span context | Durable asynchronous causation is ambiguous |
| Job enqueue does not carry trace or causation context | A worker cannot be linked back to the originating request reliably |
| Database logical operations are not bridged to tracing | The centralized Drizzle operation layer is invisible in traces |
| Cache/bucket operation records lack common context and timing | They cannot be queried consistently with spans and logs |
| Span events are not fully represented | Very short lifecycle phases must otherwise become noisy spans or disappear |
| Record correlation fields vary by signal | Queries and inspector views require signal-specific heuristics |
| External sampling can export isolated errors | A backend can receive one error record without the rest of its trace |
| OTLP adapter exports RelKit-shaped payloads | It must eventually emit valid OTLP signal requests from canonical records |

### 3.3 Existing files that must be treated as migration points

Codex must inspect the current version of at least these files before implementation:

```text
AGENTS.md
package.json
docs/architecture.md
docs/testing.md

packages/contracts/src/id.ts

packages/runtime-hono/src/create-app.ts
packages/runtime-hono/src/middleware.ts
packages/runtime-hono/src/middleware-utils.ts
packages/runtime-hono/src/request-record-middleware.ts
packages/runtime-hono/src/request-record-utils.ts
packages/runtime-hono/src/materialize-routes.ts
packages/runtime-hono/src/materialize-routes-utils.ts
packages/runtime-hono/src/route-middleware.ts
packages/runtime-hono/src/request-context.ts

packages/invocation/src/contracts.ts
packages/invocation/src/context.ts
packages/invocation/src/identity.ts
packages/invocation/src/dispatcher-context.ts
packages/invocation/src/dispatcher-scope.ts

packages/engine/src/invoke.ts
packages/engine/src/invoke-types.ts
packages/engine/src/invoke-utils.ts
packages/engine/src/invoke-runtime.ts
packages/engine/src/invoke-tracing.ts
packages/engine/src/context.ts
packages/engine/src/dependency-bridge.ts
packages/engine/src/dependency-clients.ts
packages/engine/src/event-client.ts
packages/engine/src/job-client.ts
packages/engine/src/event-invocation.ts
packages/engine/src/materialize-events.ts
packages/engine/src/materialize-jobs-types.ts
packages/engine/src/materialize-jobs-binding.ts
packages/engine/src/observability.ts

packages/runtime-effect/src/tracing.ts
packages/runtime-effect/src/tracing-span.ts
packages/runtime-effect/src/tracing-bridge.ts
packages/runtime-effect/src/logger.ts
packages/runtime-effect/src/runtime.ts
packages/runtime-effect/src/services.ts
packages/runtime-effect/src/scope.ts

packages/observability/src/model-shared.ts
packages/observability/src/model-records.ts
packages/observability/src/model-traces.ts
packages/observability/src/collector-events.ts
packages/observability/src/collector-records.ts
packages/observability/src/request-record.ts
packages/observability/src/request-details.ts
packages/observability/src/query-types.ts
packages/observability/src/query.ts
packages/observability/src/storage/index-types.ts
packages/observability/src/storage/index.ts
packages/observability/src/runtime.ts
packages/observability/src/remote-runtime.ts
packages/observability/src/telemetry-config.ts
packages/observability/src/telemetry-sampling.ts
packages/observability/src/telemetry-exporter-types.ts

packages/buckets/src/client-types.ts
packages/buckets/src/client.ts
packages/cache/src/client-types.ts
packages/cache/src/client.ts

packages/drizzle/src/runtime-types.ts
packages/drizzle/src/operations.ts
packages/drizzle/src/context.ts
packages/drizzle/src/activation.ts
packages/drizzle/src/service.ts

packages/events/src/client.ts
packages/events/src/client-utils.ts
packages/events/src/define-event.ts
packages/jobs/src/client.ts
packages/functions/src/clients.ts

packages/providers-local/src/events/delivery-types.ts
packages/providers-local/src/events/delivery.ts
packages/providers-local/src/jobs/queue-utils.ts

packages/inspector-api/src/observability.ts
apps/inspector/app/requests
apps/inspector/app/traces
apps/inspector/app/trace-waterfall.tsx
apps/inspector/app/trace-waterfall-rows.tsx

integrations/packages/otlp/src/runtime/exporter.ts
integrations/packages/otlp/src/runtime/exporter-support.ts
```

If a path changed after the reviewed baseline, search for the symbol and update the OpenSpec design before editing.

---

## 4. Locked architectural decisions

These decisions are normative for the implementation unless the OpenSpec review explicitly changes them.

### 4.1 One canonical observability pipeline

RelKit will keep one canonical flow:

```text
runtime operation
  -> canonical span/log/domain record
  -> redaction and admission
  -> bounded local persistence and stream
  -> query/index
  -> optional exporter fan-out
```

Do not create a separate OpenTelemetry-only store, a separate request timeline store, or a second tracer that bypasses `@relkit/observability`.

### 4.2 Separate identities by purpose

RelKit will not overload one identifier with several meanings.

| Identity | Meaning |
| --- | --- |
| `requestId` | One inbound HTTP request handled by one RelKit service |
| `originRequestId` | The first RelKit HTTP request that causally initiated later work |
| `traceId` | W3C-compatible distributed trace identity |
| `spanId` | One timed operation within a trace |
| `invocationId` | One function invocation attempt |
| `correlationId` | Optional application/business workflow identity |
| `causation` | The immediately preceding event, job, invocation, request, tool, or agent operation |
| `eventInstanceId` | One durable event publication identity |
| `jobInstanceId` | One durable job identity across retries |
| `generationId` + `graphHash` | Exact activated runtime/code graph identity |

### 4.3 W3C Trace Context at transport boundaries

HTTP and portable message propagation will use:

```text
traceparent
tracestate (optional)
```

A trace ID is 32 lowercase hexadecimal characters and cannot be all zeroes. A span ID is 16 lowercase hexadecimal characters and cannot be all zeroes.

Legacy IDs such as `trace-<uuid>` may remain readable from historical local data, but they must not be serialized as W3C trace context or accepted as a remote parent.

### 4.4 Ambient context outside Effect, Effect context inside invocations

Use Bun's `AsyncLocalStorage` as the outer runtime-neutral context carrier for Hono, ordinary promises, stream callbacks, provider callbacks, and non-Effect code.

Keep Effect's `InvocationTrace` as the invocation-level tracing context.

```text
AsyncLocalStorage execution context
└── Hono and ordinary async work
    └── Effect InvocationTrace
        └── function and dependency child spans
```

Use `AsyncLocalStorage.run()` for async boundaries. Do not use `enterWith()` for request or worker execution.

### 4.5 Parent span context and parent invocation are different

The invocation parent contract must represent:

```ts
interface InvocationParentContext {
  readonly span: RelkitSpanContext;
  readonly invocationId?: InvocationId;
  readonly correlationId?: string;
  readonly requestId?: RequestId;
  readonly originRequestId?: RequestId;
  readonly deadlineMs?: number;
  readonly signal?: AbortSignal;
  readonly captured?: CapturedInvocationTrace;
}
```

An HTTP server span supplies `span` but no parent `invocationId`.

A direct child function supplies both the parent span and the parent invocation ID.

Do not generate a fake invocation ID for an HTTP request.

### 4.6 Synchronous work uses parent-child spans

The following remain in one trace and use parent-child relationships:

- HTTP server to authored middleware.
- Authored middleware to route/function work occurring inside it.
- Route to target function invocation.
- Function to direct child function.
- Function to database/cache/bucket/outbound request operation.
- Function to event publish or job enqueue producer span.

### 4.7 Durable asynchronous work uses a new trace plus links

A durable event delivery or job worker attempt normally starts a new consumer trace and links to the producer span that created the message.

It preserves `originRequestId` and optional `correlationId`.

It must not reopen or continue a producer span that already ended.

An immediate in-process, non-durable, single-consumer event may remain a direct child only when the provider actually processes it synchronously before the publisher returns. The provider capability must make this behavior explicit; do not infer it from timing.

### 4.8 Spans are the timing source of truth

- Spans define start, end, nesting, links, events, outcome, and critical path.
- Request, event, job, invocation, tool, agent, and operation records provide domain summaries and query indexes.
- Request completion must not scan all records and copy them into a second mutable timing model.
- A compatibility timeline may be assembled at query time for old clients.

### 4.9 Meaningful operations are spans; point events are span events

Use spans for operations with meaningful duration:

```text
HTTP request
middleware
function invocation
database operation
transaction
cache operation
bucket operation
event publication
event processing
job enqueue
job attempt
tool call
agent/model call
outbound HTTP/RPC
```

Use events for short lifecycle markers:

```text
request.accepted
route.matched
input.mapping.started
input.mapping.completed
input.validation.failed
retry.scheduled
response.headers.ready
stream.cancelled
deadline.exceeded
```

### 4.10 Privacy and cardinality are safe by default

Never capture these by default:

- Request or response body values.
- Function input/output values.
- Event or job payload values.
- Database row values, mutation data, filters, SQL parameters, or unsanitized SQL.
- Cache values or raw cache keys.
- Bucket contents or raw object keys.
- Authorization, cookie, secret, token, or API-key headers.
- Raw URLs containing query strings or dynamic path values as span names.
- User IDs, emails, tenant IDs, or other unbounded identifiers as metric labels.

### 4.11 Telemetry failure cannot alter application behavior

Exporter, local persistence, redaction, serialization, index, and observer failures are advisory. They may emit a bounded diagnostic, but they must not:

- Change a successful application result into a failure.
- Change an application error into another error.
- Delay the request waiting for exporter flush.
- Prevent queue acknowledgement or retry transitions.
- Leak sensitive fallback data.

### 4.12 Existing OTLP integration is extended, not replaced

Enhance `integrations/packages/otlp`. Do not create a second OTLP package in core.

### 4.13 No automatic business correlation ID

Stop using `requestId` as the default `correlationId` for HTTP function calls.

`originRequestId` provides framework causal lookup. `correlationId` remains an application-defined business identity.

A compatibility period may read older records where `correlationId === requestId`, but new runtime writes must use the new meaning.

---

## 5. Target identity and propagation contracts

The exact package location may be adjusted to satisfy dependency boundaries, but the public/portable types must live below runtime packages. Prefer `@relkit/contracts` for JSON-safe transport types and `@relkit/invocation` for runtime-only invocation types.

### 5.1 ID contracts

Proposed additions to `packages/contracts/src/id.ts` or focused sibling files:

```ts
export type SpanId = string & { readonly __brand: "SpanId" };
export type TraceFlags = number & { readonly __brand: "TraceFlags" };

export function generateTraceId(): TraceId;
export function generateSpanId(): SpanId;
export function toTraceId(value: unknown): TraceId;
export function toSpanId(value: unknown): SpanId;
export function isTraceId(value: unknown): value is TraceId;
export function isSpanId(value: unknown): value is SpanId;
```

Required behavior:

- `generateTraceId()` returns 16 random bytes encoded as 32 lowercase hex characters.
- `generateSpanId()` returns 8 random bytes encoded as 16 lowercase hex characters.
- All-zero values are rejected.
- Uppercase hex is rejected at the W3C boundary rather than silently normalized.
- Generation uses cryptographically secure randomness available in Bun.
- Legacy record readers do not call the strict W3C parser for v1 historical data.

### 5.2 W3C trace carrier

```ts
export interface RelkitSpanContext {
  readonly traceId: TraceId;
  readonly spanId: SpanId;
  readonly traceFlags: TraceFlags;
  readonly traceState?: string;
  readonly remote: boolean;
}

export interface W3CTraceCarrier {
  readonly traceparent: string;
  readonly tracestate?: string;
}

export interface ParsedTraceParent {
  readonly version: "00";
  readonly context: RelkitSpanContext;
}

export function parseTraceParent(value: unknown): ParsedTraceParent | undefined;
export function formatTraceParent(context: RelkitSpanContext): string;
export function parseTraceState(value: unknown): string | undefined;
```

Required parsing rules:

- Missing input returns `undefined`.
- Malformed input returns `undefined`; request processing continues with a new trace.
- Version `ff` is invalid.
- Version `00` requires the exact standard length and field positions.
- All-zero trace and parent IDs are invalid.
- Unsupported future versions must follow the W3C forward-compatible parsing rules documented in the OpenSpec design.
- `tracestate` without valid `traceparent` is discarded.
- Unknown trace flag bits are cleared when emitting a version `00` header.
- The sampled bit is advisory and subject to RelKit's configured trust/sampling policy.

### 5.3 Causation and portable propagation envelope

```ts
export type CausationKind =
  | "request"
  | "invocation"
  | "event"
  | "job"
  | "tool"
  | "agent";

export interface CausationRef {
  readonly kind: CausationKind;
  readonly id: string;
}

export interface PropagationProducer {
  readonly serviceId?: string;
  readonly generationId: GenerationId;
  readonly graphHash: GraphHash;
}

export interface RelkitPropagationEnvelopeV1 {
  readonly version: 1;
  readonly trace: W3CTraceCarrier;
  readonly originRequestId?: RequestId;
  readonly correlationId?: string;
  readonly causation?: CausationRef;
  readonly producer: PropagationProducer;
}
```

Rules:

- The envelope is transport metadata, never part of the user payload schema.
- Provider adapters map it to message attributes, headers, metadata, or a reserved internal envelope field.
- Application handlers cannot mutate the envelope.
- Unknown future versions are rejected or ignored according to an explicit provider contract; never guess.
- The envelope is bounded and JSON-safe.
- Do not put function inputs, event payloads, job inputs, auth state, or baggage in it.

### 5.4 Ambient execution context

Proposed runtime contract:

```ts
export interface RelkitExecutionContext {
  readonly requestId?: RequestId;
  readonly originRequestId?: RequestId;
  readonly span: RelkitSpanContext;
  readonly invocationId?: InvocationId;
  readonly correlationId?: string;
  readonly causation?: CausationRef;
  readonly serviceId?: string;
  readonly generationId: GenerationId;
  readonly graphHash: GraphHash;
  readonly source: string;
  readonly attempt?: number;
  readonly deadlineMs?: number;
}

export interface CapturedExecutionContext {
  readonly value: RelkitExecutionContext;
  readonly run: <Value>(work: () => Value) => Value;
}

export interface ExecutionContextManager {
  active(): RelkitExecutionContext | undefined;
  run<Value>(context: RelkitExecutionContext, work: () => Value): Value;
  capture(): CapturedExecutionContext | undefined;
  bind<Fn extends (...args: never[]) => unknown>(fn: Fn): Fn;
}
```

Implementation requirements:

- Use one `AsyncLocalStorage<RelkitExecutionContext>` instance per runtime process/generation service, not one per request.
- Use immutable context values.
- Derive child context values rather than mutating the active object.
- `run()` must restore the previous context on normal return, throw, cancellation, and promise continuation.
- `capture()` must not serialize internal AsyncLocalStorage or Effect objects.
- Runtime shutdown calls `disable()` only when that runtime-owned storage is no longer used.
- Tests must cover nested contexts, parallel requests, timers, promises, stream callbacks, and failures.

### 5.5 Invocation parent correction

Replace the current conceptual shape where `InvocationParent.id` is always required.

Target shape:

```ts
export interface InvocationParent {
  readonly span: RelkitSpanContext;
  readonly invocationId?: InvocationId;
  readonly requestId?: RequestId;
  readonly originRequestId?: RequestId;
  readonly correlationId?: string;
  readonly deadlineMs?: number;
  readonly signal?: AbortSignal;
  readonly captured?: CapturedInvocationTrace;
}
```

Migration rules:

- Rename persisted `parentId` to `parentInvocationId` in the v2 model.
- Accept v1 `parentId` while reading legacy records.
- Do not persist `captured`; it is process-local runtime state only.
- A direct function call sets `invocationId`.
- An HTTP server span leaves `invocationId` absent.
- Event/job consumer links are not represented as a parent invocation unless the consumer is intentionally executed synchronously in the same active trace.

---

## 6. Target span and record model

### 6.1 Span lifecycle model

RelKit currently emits start and completion lifecycle records. Preserve live streaming capability while making completion records authoritative.

```ts
export type SpanKind =
  | "server"
  | "client"
  | "producer"
  | "consumer"
  | "internal";

export interface SpanLinkRecord {
  readonly traceId: TraceId;
  readonly spanId: SpanId;
  readonly traceFlags?: TraceFlags;
  readonly traceState?: string;
  readonly attributes?: SafeAttributes;
}

export interface SpanEventRecord {
  readonly name: string;
  readonly timestamp: string;
  readonly attributes?: SafeAttributes;
}

export interface SpanRecordV2 extends VersionedRecord<"span"> {
  readonly spanId: SpanId;
  readonly traceId: TraceId;
  readonly parentSpanId?: SpanId;
  readonly kind: SpanKind;
  readonly name: string;
  readonly status: "started" | "completed";
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly durationMs?: number;
  readonly outcome?: InvocationOutcome | OperationOutcome | RequestOutcome;
  readonly errorId?: string;
  readonly attributes: SafeAttributes;
  readonly events: readonly SpanEventRecord[];
  readonly links: readonly SpanLinkRecord[];

  readonly requestId?: RequestId;
  readonly originRequestId?: RequestId;
  readonly invocationId?: InvocationId;
  readonly parentInvocationId?: InvocationId;
  readonly functionId?: string;
  readonly serviceId?: string;
  readonly generationId?: GenerationId;
  readonly graphHash?: GraphHash;
  readonly correlationId?: string;
  readonly causation?: CausationRef;
  readonly source?: InvocationSource | string;
  readonly attempt?: number;
}
```

Rules:

- A start record may use a provisional name.
- The completion record contains the final route-aware name and complete attributes/events/links.
- Query code coalesces records by `spanId` and prefers completion data.
- Exporters emit only completed spans unless a vendor explicitly supports live spans.
- A span is completed exactly once.
- Completion without a matching start is accepted as a recoverable record and marked incomplete in queries.
- Start without completion remains visible as in-progress until retention or generation termination marks it abandoned/cancelled.

### 6.2 Shared record context

Create a reusable v2 correlation contract and apply it consistently:

```ts
export interface RecordContextV2 {
  readonly traceId?: TraceId;
  readonly spanId?: SpanId;
  readonly parentSpanId?: SpanId;
  readonly requestId?: RequestId;
  readonly originRequestId?: RequestId;
  readonly invocationId?: InvocationId;
  readonly parentInvocationId?: InvocationId;
  readonly correlationId?: string;
  readonly causation?: CausationRef;
  readonly serviceId?: string;
  readonly generationId?: GenerationId;
  readonly graphHash?: GraphHash;
  readonly attempt?: number;
}
```

Apply it to new versions of:

```text
RequestRecord
InvocationRecord
LogRecord
SpanRecord
TraceRecord
EventRecord
JobRecord
OperationRecord
ToolRecord
AgentTurnRecord
DiagnosticRecord where meaningful
```

### 6.3 Request record v2

```ts
export interface RequestRecordV2 extends VersionedRecord<"request">, RecordContextV2 {
  readonly requestId: RequestId;
  readonly originRequestId: RequestId;
  readonly traceId: TraceId;
  readonly rootSpanId: SpanId;
  readonly generationId: GenerationId;
  readonly graphHash: GraphHash;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly durationMs: number;
  readonly method: string;
  readonly rawPath: string;
  readonly normalizedRoute?: string;
  readonly routeId?: string;
  readonly functionId?: string;
  readonly status: number;
  readonly requestBytes?: number;
  readonly responseBytes?: number;
  readonly outcome: RequestOutcome;
  readonly errorId?: string;
}
```

Do not persist a copied full timeline in new request records. The query response may expose a derived compatibility timeline.

### 6.4 Operation record

Introduce a general logical operation record instead of continuing to widen `ResourceRecord` indefinitely.

```ts
export type OperationCategory =
  | "database"
  | "cache"
  | "bucket"
  | "http"
  | "rpc"
  | "provider";

export type OperationOutcome =
  | "success"
  | "validation-error"
  | "provider-failure"
  | "cancelled"
  | "timeout"
  | "unsupported"
  | "defect";

export interface OperationRecordV2
  extends VersionedRecord<"operation">,
    RecordContextV2 {
  readonly category: OperationCategory;
  readonly operation: string;
  readonly targetId: string;
  readonly provider?: string;
  readonly profile?: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly durationMs: number;
  readonly outcome: OperationOutcome;
  readonly bytes?: number;
  readonly resultCount?: number;
  readonly cacheHit?: boolean;
  readonly errorId?: string;
  readonly attributes?: SafeAttributes;
}
```

Migration behavior:

- Continue reading v1 `resource` records.
- Convert new cache/bucket/database writes to `operation` records.
- Query adapters may project legacy resource records into the operation union.
- Keep a deprecated TypeScript alias only where required to avoid a single giant breaking edit.
- Update capture signal validation to accept `operation`; decide in OpenSpec whether `resource` remains selectable solely for historical data.

### 6.5 Event records

Add enough data to reconstruct publication, fan-out, delivery, and retries:

```ts
export interface EventRecordV2 extends VersionedRecord<"event">, RecordContextV2 {
  readonly kind: "publication" | "delivery";
  readonly eventId: string;
  readonly eventVersion: number;
  readonly instanceId: EventInstanceId;
  readonly deliveryId?: string;
  readonly triggerId?: string;
  readonly functionId?: string;
  readonly state:
    | "accepted"
    | "published"
    | "started"
    | "delivered"
    | "retrying"
    | "failed"
    | "dead-lettered";
  readonly occurredAt: string;
  readonly completedAt?: string;
  readonly durationMs?: number;
  readonly payloadBytes?: number;
  readonly producerSpan?: SpanLinkRecord;
  readonly links?: readonly SpanLinkRecord[];
  readonly errorId?: string;
}
```

### 6.6 Job records

```ts
export interface JobRecordV2 extends VersionedRecord<"job">, RecordContextV2 {
  readonly jobId: string;
  readonly instanceId: JobInstanceId;
  readonly functionId: string;
  readonly profile: string;
  readonly state:
    | "accepted"
    | "available"
    | "leased"
    | "delayed"
    | "completed"
    | "dead-lettered";
  readonly attempt: number;
  readonly acceptedAt: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly durationMs?: number;
  readonly inputBytes?: number;
  readonly outputBytes?: number;
  readonly enqueueSpan?: SpanLinkRecord;
  readonly links?: readonly SpanLinkRecord[];
  readonly errorId?: string;
}
```

### 6.7 Request execution query

Add an explicit query result designed for the inspector rather than overloading raw records:

```ts
export interface RequestExecutionDetail {
  readonly request: RequestRecordV2 | LegacyRequestRecord;
  readonly rootTrace: TraceDetail;
  readonly continuations: readonly TraceDetail[];
  readonly records: readonly ObservabilityRecord[];
  readonly summary: {
    readonly spanCount: number;
    readonly logCount: number;
    readonly errorCount: number;
    readonly operationCount: number;
    readonly eventPublications: number;
    readonly eventDeliveries: number;
    readonly jobs: number;
    readonly attempts: number;
  };
  readonly truncated: boolean;
  readonly truncationReasons: readonly string[];
}
```

Recommended API:

```ts
query.execution(requestId: string): Promise<RequestExecutionDetail | undefined>
```

Recommended endpoint:

```text
GET /_relkit/v1/requests/:requestId/execution
```

The existing request detail endpoint may continue returning its old shape during a compatibility window.

---

## 7. Span naming and attribute catalog

Names must remain low-cardinality. Dynamic IDs belong in protected attributes only when explicitly allowed; most must not be captured at all.

### 7.1 HTTP server

Provisional name:

```text
HTTP POST
```

Final matched name:

```text
POST /orders/{orderId}
```

Do not use:

```text
POST /orders/83d73f9a
```

Required attributes where available:

```text
http.request.method
http.route
http.response.status_code
url.scheme
url.path
server.address
server.port
network.protocol.name
relkit.request.id
relkit.origin_request.id
relkit.route.id
relkit.function.id
relkit.service.id
relkit.generation.id
relkit.graph.hash
relkit.outcome
```

`url.path` may be recorded because it is part of standard HTTP conventions, but it must never be used as the span name or a metrics label. Query strings are excluded by default.

### 7.2 Middleware

Name:

```text
middleware auth.require-user
```

Attributes:

```text
relkit.middleware.id
relkit.middleware.path
relkit.middleware.order
relkit.middleware.coverage
```

The duration is inclusive when middleware calls `await next()`. The inspector must label it as inclusive. Do not pretend to derive exclusive middleware time.

### 7.3 Function invocation

Name:

```text
function orders.create
```

Attributes:

```text
relkit.function.id
relkit.invocation.id
relkit.invocation.parent_id
relkit.invocation.source
relkit.invocation.attempt
relkit.service.id
relkit.deadline_ms
relkit.request.id
relkit.origin_request.id
```

### 7.4 Database

Names:

```text
SELECT users
INSERT orders
UPDATE inventory
DELETE sessions
TRANSACTION postgres
```

Attributes:

```text
db.system.name
db.namespace
db.collection.name
db.operation.name
db.query.summary
relkit.database.id
relkit.database.profile
relkit.model.id
relkit.transaction.depth
relkit.result.count
```

Rules:

- Instrument the highest logical Drizzle operation available.
- Do not parse operation names from raw SQL when the logical operation is already known.
- `db.query.text` is disabled by default.
- Do not capture argument objects, selector values, mutation data, or returned rows.
- A remote database uses `client`; in-memory SQLite may use `internal`.
- One logical mutation remains one span even if the adapter performs internal recovery reads.

### 7.5 Cache

Name:

```text
cache get sessions
cache set order-summary
cache delete order-list
```

Attributes:

```text
relkit.cache.id
relkit.cache.profile
relkit.cache.operation
relkit.cache.provider
relkit.cache.hit
relkit.ttl_ms
```

Do not capture the raw key or value. A future optional keyed hash must use an application-specific secret and remain disabled by default.

### 7.6 Bucket

Name:

```text
bucket put receipts
bucket get assets
bucket delete exports
```

Attributes:

```text
relkit.bucket.id
relkit.bucket.profile
relkit.bucket.operation
relkit.bucket.provider
relkit.payload.size
relkit.content.type
```

Do not capture raw object keys, signed URLs, metadata values, or object contents.

### 7.7 Event publication and delivery

Names:

```text
publish order.created
process order.created
```

Attributes:

```text
messaging.operation.type
messaging.operation.name
messaging.destination.name
messaging.message.id
relkit.event.id
relkit.event.version
relkit.event.profile
relkit.event.delivery_id
relkit.event.trigger_id
relkit.delivery.attempt
relkit.delivery.replayed
```

RelKit-specific fields are stable. OpenTelemetry messaging semantic-convention mappings must be versioned because those conventions are not all stable.

### 7.8 Job enqueue and worker attempt

Names:

```text
enqueue invoice.generate
process invoice.generate
```

Attributes:

```text
messaging.operation.type
messaging.operation.name
messaging.destination.name
messaging.message.id
relkit.job.id
relkit.job.profile
relkit.job.instance_id
relkit.job.attempt
relkit.job.state
relkit.retry.classification
```

### 7.9 Tool and agent

Names:

```text
tool orders.lookup
agent support.respond
model openai.responses
```

Attributes must remain provider-neutral where possible. Do not capture prompts, tool arguments, model output, or approval secrets by default.

### 7.10 Error fields

Use predictable, bounded attributes:

```text
error.type
relkit.error.id
relkit.outcome
```

Do not put arbitrary error messages in span names or indexed attributes. Redacted error detail belongs in a bounded event or log record.

---

## 8. Public developer experience

### 8.1 Default behavior

Developers should only configure telemetry globally and use normal RelKit APIs. They must not pass tracing IDs manually.

```ts
export default defineApp({
  // providers and application configuration
  telemetry: {
    capture: {
      signals: [
        "request",
        "invocation",
        "span",
        "log",
        "operation",
        "event",
        "job",
        "tool",
        "agent",
        "diagnostic",
      ],
    },
  },
});
```

### 8.2 Optional explicit business tracing

After the automatic foundation is complete, expose a small API through function context:

```ts
export interface TraceContext {
  readonly traceId: TraceId;
  readonly spanId: SpanId;
  readonly requestId?: RequestId;
  readonly originRequestId?: RequestId;

  span<Value>(
    name: string,
    options: {
      readonly attributes?: Readonly<Record<string, AttributeValue>>;
      readonly kind?: "internal" | "client";
    },
    work: () => Value | Promise<Value>,
  ): Promise<Value>;

  event(
    name: string,
    attributes?: Readonly<Record<string, AttributeValue>>,
  ): void;

  setAttributes(
    attributes: Readonly<Record<string, AttributeValue>>,
  ): void;
}
```

Example:

```ts
handler: async (input, ctx) => {
  return ctx.trace.span(
    "pricing.calculate",
    {
      attributes: {
        "pricing.strategy": "enterprise-contract",
      },
    },
    () => pricingLibrary.calculate(input),
  );
};
```

Validation rules:

- Span names must be non-empty and bounded.
- Attribute keys and values pass through the same redaction and size limits as automatic spans.
- The API must not expose a mutable span object.
- `setAttributes()` only changes the current active span before completion.
- Calls made without an active span are safe no-ops or create an explicitly documented standalone root; choose one behavior in OpenSpec. Preferred initial behavior is safe no-op plus a development diagnostic.

### 8.3 Proposed telemetry configuration extension

The current normalizer rejects unknown keys, so this requires a versioned public configuration change.

```ts
export default defineApp({
  telemetry: {
    propagation: {
      traceContext: "w3c",
      responseHeaders: {
        requestId: true,
        traceId: false,
        traceparent: false,
      },
      requestId: {
        header: "x-request-id",
        acceptIncoming: false,
      },
      originRequestId: {
        header: "x-relkit-origin-request-id",
        acceptIncoming: false,
      },
    },

    instrumentation: {
      http: true,
      middleware: "authored",
      routeMapping: "events",
      functions: true,
      functionLifecycle: "events",
      database: {
        level: "logical",
        driverSpans: "disabled",
        statementText: false,
      },
      cache: true,
      buckets: true,
      events: true,
      jobs: true,
      tools: true,
      agents: true,
      outboundHttp: "relkit-clients",
    },

    limits: {
      maxSpansPerTrace: 512,
      maxAttributesPerSpan: 64,
      maxEventsPerSpan: 32,
      maxLinksPerSpan: 64,
      maxAttributeValueBytes: 1024,
    },

    capture: {
      signals: [
        "request",
        "invocation",
        "span",
        "log",
        "operation",
        "event",
        "job",
        "tool",
        "agent",
        "diagnostic",
      ],
    },

    localRetention: {
      maxRecords: 100_000,
      maxBytes: 128_000_000,
      maxAgeMs: 86_400_000,
    },

    exportSampling: {
      traceRate: 0.1,
      minimumLogLevel: "info",
    },

    redaction: {
      mode: "strict",
      redactKeys: [
        "authorization",
        "cookie",
        "password",
        "token",
        "secret",
        "apiKey",
      ],
    },

    exporters: {
      observability: otlp({
        endpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,
      }),
    },
  },
});
```

The numeric values above are initial defaults, not protocol guarantees. Benchmark and adjust them before release. Every limit must be normalized, validated, and tested.

### 8.4 Trusted incoming RelKit correlation metadata

Default behavior:

- Always create a new local `requestId`.
- Accept valid W3C trace context according to propagation policy.
- Ignore incoming `x-request-id` and `x-relkit-origin-request-id` unless an internal host trust policy explicitly permits them.
- Return the local `x-request-id` response header.

Add an internal host/runtime policy rather than a serializable user callback in `defineApp`:

```ts
export interface HttpCorrelationTrustPolicy {
  readonly acceptRequestId?: (request: Request, value: string) => boolean;
  readonly acceptOriginRequestId?: (request: Request, value: string) => boolean;
}
```

The generated public app config may request trusted acceptance only when the deployment/runtime adapter supplies such a policy. Startup must fail with a clear diagnostic if trusted acceptance is configured without a trust implementation.

---

## 9. HTTP lifecycle design

### 9.1 Framework middleware order

Fold request and trace initialization into one framework-owned execution-context layer.

Recommended order:

```text
execution-context
limits
request-record
<auth/runtime framework middleware>
<authored route middleware>
route handler
```

Compatibility exports may remain temporarily:

```ts
requestIdMiddleware // deprecated wrapper
traceMiddleware     // deprecated wrapper
```

They must delegate to the shared implementation and must not create duplicate spans or IDs.

### 9.2 Request start algorithm

For every accepted request, including unmatched routes and framework endpoints:

1. Read `traceparent` and `tracestate`.
2. Parse and validate the remote context.
3. If invalid or absent, generate a new trace ID.
4. Generate a server span ID.
5. Generate a local request ID unless a trusted policy accepts an incoming one.
6. Resolve `originRequestId` from trusted internal metadata or default to the local request ID.
7. Create a provisional HTTP `server` span.
8. Create immutable `RelkitExecutionContext` with generation and graph identity.
9. Run the remaining Hono pipeline inside `ExecutionContextManager.run()`.
10. Set the local request ID response header.
11. Record `request.accepted` as a span event.
12. Start the request domain record builder.

### 9.3 Route matching

When a route is selected:

- Update the active server span's final name using method plus route template.
- Set `http.route`, `relkit.route.id`, `relkit.function.id`, and optional service identity.
- Record `route.matched` event.
- Update the request record builder with route/function IDs.
- Do not create a separate span only for route matching.

For unmatched routes:

- Keep a low-cardinality name such as `HTTP GET` or `GET <unmatched>`.
- Do not use the raw path as the span name.
- Record the 404/405 outcome.

### 9.4 Input mapping and validation

Default mode is events on the server span or function span:

```text
input.mapping.started
input.mapping.completed
input.validation.failed
```

Include only:

```text
target function ID
duration
issue count
outcome
```

Do not include input values or validation issue values. Redacted field paths may be included only if current redaction rules permit them.

A verbose configuration may create an `internal` child span for mapping, but this is not the default.

### 9.5 Authored middleware

Each authored middleware gets an `internal` span around its complete handler execution.

Pseudo-implementation:

```ts
return async (context, next) => {
  return operationObserver.run(
    {
      name: `middleware ${middlewareId}`,
      kind: "internal",
      attributes: middlewareAttributes,
    },
    () => descriptor.handler(context, next, middlewareContext),
  );
};
```

The active child context must be visible to:

- Middleware logs.
- Nested middleware.
- The route and function when the middleware calls `next()`.
- Any supported operations invoked by middleware.

### 9.6 Function invocation from HTTP

Pass or derive a typed parent span context from the active server/middleware span.

Do not only pass a matching trace ID string.

Expected hierarchy:

```text
HTTP SERVER span
└── outer middleware
    └── inner middleware
        └── function invocation
```

When no authored middleware covers the route, the function is a direct child of the server span.

### 9.7 Response completion

The HTTP span ends at the actual response lifecycle boundary.

Immediate completion cases:

- `HEAD` response.
- `204` response.
- Response with no body.
- Ordinary buffered response after handler completion.

Streaming cases:

- Wrap the response `ReadableStream`.
- Bind stream pull/cancel/error callbacks to the captured execution context.
- End the span when the body closes, errors, or is cancelled.
- Do not end it as soon as the handler returns a streaming `Response`.
- Ensure one-shot finalization with an idempotent finalizer.

Proposed internal helper:

```ts
interface ResponseFinalizer {
  readonly finish: (result: HttpCompletion) => void;
  readonly wrap: (response: Response) => Response;
  readonly finished: () => boolean;
}
```

The finalizer owns:

- Span completion.
- Request domain record completion.
- Response byte count when safely known.
- Outcome/status mapping.
- Lifecycle hook emission.
- Abort listener cleanup.

### 9.8 Failures and cancellation

Required mappings:

| Condition | Request outcome | Suggested status |
| --- | --- | --- |
| Success | `success` | Actual response status |
| Input validation | `validation-error` | 400/422 according to route contract |
| Declared application error | mapped application outcome | Declared status |
| Provider failure | `defect` at HTTP boundary, provider failure in child | 500/502 as mapped |
| Timeout | `timeout` | 504 |
| Client cancellation | `cancelled` | 499 in internal record; response may be unavailable |
| Defect | `defect` | 500 |

An exception event contains only safe, redacted fields. The original error continues through existing failure mapping.

### 9.9 Framework and raw routes

Instrument all of these:

- Compiled application routes.
- Raw routes.
- RPC endpoints.
- MCP endpoints.
- Static file endpoints.
- Internal health endpoints.
- Inspector endpoints when enabled.
- 404 and 405 outcomes.

Use an attribute to identify framework/internal endpoints and allow capture filtering. Do not accidentally recursively instrument observability exporter HTTP requests.

---

## 10. Function, lifecycle, and log behavior

### 10.1 Function span

The current function invocation span remains the primary executable unit.

Required behavior:

- Inherit active parent span context from ambient execution context when no explicit invocation parent is supplied.
- Inherit request ID, origin request ID, correlation ID, generation, graph, service, deadline, and cancellation signal.
- Generate a new invocation ID and span ID.
- Preserve the parent trace ID for synchronous calls.
- Emit start and completion records.
- Normalize and record success, validation, declared error, provider failure, timeout, cancellation, and defect.
- Complete the span before releasing invocation admission, unless the OpenSpec design documents a different ordering with tests.

### 10.2 Direct child function

For `ctx.functions.*` or equivalent direct invocation:

- Parent invocation ID is the caller invocation ID.
- Parent span ID is the caller's active span ID.
- Trace ID remains the same.
- Request and origin request IDs remain the same.
- Child deadline cannot exceed parent deadline.
- Cancellation propagates from parent.
- Recursion and call-stack safeguards remain unchanged.

### 10.3 Lifecycle hooks

Default representation:

| Phase | Representation |
| --- | --- |
| Input validation start/end | span events |
| `onBefore` start/end | span events by default; child span in verbose mode |
| Handler | body of function span |
| `onAfter` start/end | span events by default; child span in verbose mode |
| Output validation start/end | span events |
| Approval decision | tool span event |
| Retry scheduled | consumer span event |

The lifecycle implementation must keep its existing ordering and failure semantics.

### 10.4 Logs

Update the Effect logger and any non-Effect logger bridge so all in-context logs automatically include:

```text
traceId
spanId
requestId when present
originRequestId when present
invocationId when present
functionId when present
correlationId when present
serviceId
generationId
graphHash
source
```

Rules:

- Application fields cannot override reserved correlation fields.
- Missing context is valid for startup logs.
- Redaction occurs before local persistence and exporter fan-out.
- Do not copy full propagation baggage into logs.
- Middleware logs inherit the middleware span.
- Stream callback logs inherit the server span until completion.
- Logs emitted by async work intentionally detached after request completion require explicit capture/re-entry or start a new standalone context; they must not accidentally retain a finished request context forever.

### 10.5 Optional `ctx.trace`

Implement only after automatic parentage and logger correlation are stable.

Add it through the common context factory, not separately in each function type.

Required tests:

- Child business span is nested under function.
- Event attaches to current span.
- Unsafe attributes are redacted.
- Throwing work completes the child span and rethrows the original failure.
- Calling after parent completion cannot mutate a completed span.

---

## 11. Unified logical operation instrumentation

### 11.1 One implementation primitive

Use one internal operation runner for all logical operations, even if low-level package bridge types remain structurally local to avoid dependency cycles.

```ts
export interface ObserveOperationOptions {
  readonly name: string;
  readonly kind: SpanKind;
  readonly category: OperationCategory;
  readonly operation: string;
  readonly targetId: string;
  readonly provider?: string;
  readonly profile?: string;
  readonly attributes?: SafeAttributes;
  readonly links?: readonly SpanLinkRecord[];
  readonly signal?: AbortSignal;
  readonly deadlineMs?: number;
}

export interface OperationObserver {
  run<Value>(
    options: ObserveOperationOptions,
    work: () => Value | Promise<Value>,
  ): Promise<Value>;
}
```

`run()` must:

1. Read the active execution context.
2. Create a child span or an explicit root when documented.
3. Install the child span as active.
4. Execute the original operation.
5. Classify the result/failure without replacing it.
6. Emit an operation record with the span context.
7. Complete the span exactly once.
8. Re-throw the original normalized failure.
9. Ignore observer/export failures.

### 11.2 Dependency-boundary constraints

Do not create a package import cycle merely to share an interface.

Preferred strategy:

- Put portable operation record types in `@relkit/observability` or a lower data-only contract module.
- Keep resource package bridge interfaces structural.
- Implement the common observer in `@relkit/runtime-effect` and adapt it through `@relkit/engine`.
- Run `bun run check` after each dependency-edge change.

### 11.3 Duplicate span prevention

Initial release policy:

- RelKit logical instrumentation is enabled.
- Third-party driver auto-instrumentation is disabled unless explicitly supported.
- Do not emit both an engine dependency span and a resource-client span for the same logical operation.
- The resource client owns the operation span; the engine only supplies the bridge/context.
- Database driver spans remain disabled by default.

If a supported driver layer is later enabled, add an instrumentation-suppression token keyed by logical operation ID and test that only one logical span is emitted.

---

## 12. Database instrumentation

### 12.1 Interception points

Use the current centralized Drizzle paths:

```text
packages/drizzle/src/operations.ts -> runOperation
packages/drizzle/src/context.ts    -> transaction
packages/drizzle/src/activation.ts -> context construction
packages/drizzle/src/runtime-types.ts -> binding/runtime metadata
```

### 12.2 Runtime injection

Extend activation/context construction with an internal optional observer without exposing runtime tracing in the descriptor:

```ts
export interface DrizzleActivationOptions {
  readonly env: Readonly<Record<string, unknown>>;
  readonly operationObserver?: DatabaseOperationObserver;
  readonly profile?: string;
  readonly provider?: string;
}
```

Do not add the observer to the serializable descriptor object. The host/runtime injects it when activating the service.

If changing `activateDrizzleService(service, env)` is too disruptive, add an overload or internal activation function and preserve the existing public signature.

### 12.3 Logical model operation span

Wrap the complete logical API call, including internal adapter retries/recovery reads:

```text
findOne  -> SELECT <table>
findMany -> SELECT <table>
insert   -> INSERT <table>
update   -> UPDATE <table>
delete   -> DELETE <table>
upsert   -> UPSERT <table>
custom model method -> model <table>.<method>
```

Attributes are derived from static metadata:

```text
dialect
database table name
logical model name
operation
profile
provider
transaction depth
result count where cheap and safe
```

Do not inspect or serialize the `args` value into telemetry.

### 12.4 Transaction span

Create a transaction parent span around the callback:

```text
TRANSACTION postgres
└── INSERT orders
└── UPDATE inventory
```

Requirements:

- Nested portable transaction rejection remains unchanged.
- Commit and rollback become events on the transaction span.
- Rollback due to failure records the normalized outcome.
- SQLite serialization/locking implementation remains internal.
- A transaction span ends after commit/rollback completes.

### 12.5 Custom overrides

When a model operation override calls `base()`:

- Keep one logical operation span around the override plus base work.
- Do not create a second span around `base()`.
- Attribute whether an override was used with a bounded boolean.
- Custom model methods may create their own child business spans through `ctx.trace` later.

### 12.6 Database tests

- [ ] Every reserved model operation emits one operation span and record.
- [ ] Static table/model names are correct for SQLite, Postgres, and MySQL fixtures.
- [ ] No selector, mutation, or row values appear in serialized records.
- [ ] Transaction is parent of contained operations.
- [ ] Commit and rollback events are present.
- [ ] MySQL recovery reads do not create duplicate logical spans.
- [ ] Timeout, cancellation, validation, provider failure, and defect map correctly.
- [ ] Standalone Drizzle activation without an observer behaves exactly as before.

---

## 13. Cache and bucket instrumentation

### 13.1 Cache

Upgrade existing observations to include timing and active context through the common observer.

Required operation metadata:

```text
cache ID
profile
provider
operation
outcome
duration
cache hit when safely knowable
TTL when supplied and bounded
```

Hit semantics:

- `get`: hit when returned value is not `undefined`.
- `has`: use the boolean result.
- `getOrSet`: record whether producer execution was needed when the provider contract exposes that information. Do not infer incorrectly if provider API does not expose it.
- `increment`: no hit field unless provider semantics define one.

Privacy:

- No key, value, producer result, or validation issue value.
- Key schema name may be included only if static and useful.

### 13.2 Bucket

Required operation metadata:

```text
bucket ID
profile
provider
operation
outcome
duration
input/output bytes when safely known
content type when safe
```

Privacy:

- No raw key or prefix.
- No signed URL.
- No metadata values.
- No object bytes.

### 13.3 Existing hooks

Keep `onOperation` compatibility until all consumers use canonical operation records. It may delegate from the new observer result.

Avoid emitting two operation records from the same call.

### 13.4 Resource tests

- [ ] All cache methods emit exactly one child span.
- [ ] All bucket methods emit exactly one child span.
- [ ] Operation spans inherit request/origin/invocation context.
- [ ] Direct resource use outside an invocation follows the documented standalone behavior.
- [ ] Keys and values are absent from snapshots and exporter payloads.
- [ ] Byte counts are correct and bounded.
- [ ] Unsupported capabilities map to `unsupported`.
- [ ] Cancellation and deadline behavior remain unchanged.
- [ ] Existing provider fake tests remain green.

---

## 14. Event propagation and delivery

### 14.1 Publication

The event client creates one `producer` span around validation plus provider acceptance:

```text
publish order.created
```

The context injected into the message uses the producer span, not merely the surrounding function span.

Publication flow:

1. Create producer span.
2. Validate payload.
3. Build `RelkitPropagationEnvelopeV1` from producer span context.
4. Add origin request, business correlation, causation invocation, generation, graph, and service metadata.
5. Pass user payload and reserved propagation metadata separately to provider.
6. Wait for provider acceptance.
7. Emit publication record with producer span reference.
8. Complete producer span.

### 14.2 Event envelope separation

Do not expose the propagation metadata as part of the application event input.

One acceptable internal shape:

```ts
interface InternalEventEnvelope<Payload> {
  readonly event: EventEnvelope<Payload>;
  readonly propagation?: RelkitPropagationEnvelopeV1;
}
```

The public `EventEnvelope`/publish result may continue exposing safe high-level trace/correlation IDs during migration, but provider persistence must use the versioned reserved envelope.

OpenSpec must define whether those older public fields become deprecated or remain convenience projections.

### 14.3 Provider contract

Extend event provider publish/register contracts so propagation metadata survives:

- Local ephemeral provider.
- Local durable provider and its store validation.
- Replay/admin paths.
- AWS/event integrations currently implementing the provider capability.
- Test fakes.

Every adapter must document:

- Where trace metadata is stored.
- Maximum metadata size.
- What happens when metadata is missing or malformed.
- Whether delivery is synchronous, ephemeral asynchronous, or durable.

### 14.4 Delivery

For durable delivery:

1. Read and validate the propagation envelope.
2. Generate a new consumer trace ID and span ID.
3. Create a `consumer` span named `process <eventId>`.
4. Add a link to the producer span context.
5. Preserve `originRequestId` and `correlationId`.
6. Set causation to the event instance or delivery identity.
7. Run the target event function as a child invocation.
8. Record attempt and replay metadata.
9. Apply existing retry/ack/dead-letter semantics.
10. Complete the consumer span after acknowledgement or failure transition.

For a synchronous ephemeral provider:

- It may use the producer span as the parent of a consumer child span.
- It must still emit distinct producer and consumer spans.
- It must be explicitly marked synchronous by capability metadata.

### 14.5 Fan-out

When one publication reaches multiple triggers:

- Each delivery gets a distinct delivery ID.
- Each consumer attempt gets a distinct span.
- Every consumer links to the same producer context.
- One consumer failure does not alter sibling trace data.
- The request execution query groups all continuations by event instance and trigger.

### 14.6 Retries and replay

Each retry/replay is a new consumer span and new function invocation.

Recommended links:

- Always link to the original producer span.
- Optionally link to the immediately preceding attempt, bounded to one retry link.
- Do not append an unbounded link chain.

Record:

```text
attempt
replayed
retry classification
scheduled delay
delivery state
error ID
dead-letter transition
```

### 14.7 Event tests

- [ ] Publication gets one producer span.
- [ ] Provider receives a valid propagation envelope.
- [ ] User payload/schema remains unchanged.
- [ ] Durable delivery starts a new trace and links to producer.
- [ ] Synchronous ephemeral delivery follows the documented parent-child shape.
- [ ] Fan-out creates independent consumer traces/spans.
- [ ] Retry creates a new span and invocation with stable event/delivery identity.
- [ ] Replay is distinguishable and retains original causation.
- [ ] Missing/malformed propagation creates a safe new trace and diagnostic rather than failing delivery.
- [ ] Local store restart preserves propagation metadata.
- [ ] No event payload values enter telemetry records.

---

## 15. Job propagation and attempts

### 15.1 Enqueue contract

Extend internal job enqueue context with:

```ts
interface JobOperationContext {
  readonly operation: "enqueue";
  readonly signal: AbortSignal;
  readonly profile: string;
  readonly deadlineMs?: number;
  readonly correlationId?: string;
  readonly originRequestId?: RequestId;
  readonly causationInvocationId?: InvocationId;
  readonly propagation: RelkitPropagationEnvelopeV1;
}
```

The public `JobEnqueueOptions` remains focused on application options. Do not require developers to pass propagation fields.

### 15.2 Producer span

The job client creates:

```text
enqueue invoice.generate                         PRODUCER
```

Flow:

1. Create producer span.
2. Validate job input.
3. Build propagation envelope from the producer span.
4. Enqueue user input plus reserved propagation metadata.
5. Emit accepted job record with enqueue span reference.
6. Complete producer span after queue acceptance.

### 15.3 Queue entry/store migration

Extend internal `JobQueueEntry` and queue enqueue types with a versioned optional propagation field.

Requirements:

- JSON-safe.
- Included in persistence checksums/records.
- Validated on restart.
- Preserved across accepted, available, leased, delayed, and dead-lettered states.
- Preserved across administrative retry.
- Not included in user-visible input.
- Backward-compatible with old entries that lack it.

When reading a legacy entry without propagation:

- Start a safe new consumer trace.
- Leave `originRequestId` absent.
- Emit a bounded diagnostic only when useful; do not spam per poll cycle.

### 15.4 Worker attempt

Each attempt creates one consumer span:

```text
process invoice.generate                         CONSUMER
└── function invoice.generate                    INTERNAL
```

Rules:

- New trace per durable attempt.
- Link to original enqueue producer span.
- Preserve origin request and business correlation.
- Stable job instance ID across attempts.
- New consumer span ID and invocation ID per attempt.
- The attempt span covers function invocation and queue transition/ack outcome as defined in OpenSpec.
- Retry scheduling is an event on the failed attempt span and a state change record.

### 15.5 Scheduled jobs

A schedule-triggered job without a causal request:

- Starts a producer span for schedule enqueue or a root consumer trace according to the existing scheduler architecture.
- Has no `requestId` or `originRequestId`.
- Uses causation `{ kind: "job", id: scheduleId }` or a dedicated schedule kind if added to the contract.
- Includes schedule ID and fire time as safe attributes.

### 15.6 Job tests

- [ ] Enqueue gets one producer span and propagation envelope.
- [ ] Queue store persists and restores propagation.
- [ ] Attempt starts a new consumer trace linked to enqueue.
- [ ] Function invocation is child of consumer span.
- [ ] Retry has stable job instance ID and new span/invocation IDs.
- [ ] Delayed retry preserves origin request and correlation.
- [ ] Dead-letter record links to enqueue and final attempt.
- [ ] Admin retry keeps original causal identity but creates a fresh attempt span.
- [ ] Legacy queue entries remain executable.
- [ ] Job inputs never appear in span, log, or operation snapshots unless explicitly logged by application code and then redacted.

---

## 16. Observability storage, indexes, and queries

### 16.1 Model version

Bump the observability model/protocol version for the new record shapes.

Required migration strategy:

- v1 remains readable.
- New runtime writes v2 only after all current-process consumers understand it.
- Record admission validates by version.
- Query layers normalize v1 and v2 into a common read model.
- Remote producer/consumer protocol rejects unsupported future versions with a clear diagnostic.
- Local segment recovery does not discard valid v1 data.

### 16.2 Index fields

Extend index entries and filters with:

```text
originRequestId
spanId
parentSpanId
invocationId
parentInvocationId
correlationId
eventInstanceId
jobInstanceId
deliveryId
triggerId
operationCategory
operationTargetId
causationKind
causationId
errorId
```

Indexing rules:

- Index only fields useful for bounded lookup.
- Do not index arbitrary attributes.
- Preserve retention deletion across every secondary index.
- Rebuild/recover indexes deterministically from segments.
- Add migration tests for v1 index files.

### 16.3 Remove request-finish full scans

Replace this pattern conceptually:

```text
finish request
  -> read all collected records
  -> filter matching records
  -> append details to request timeline
```

With:

```text
operation occurs
  -> record written with request/origin/trace/span identity
  -> secondary index updated

request query
  -> fetch request/root trace by direct indexes
  -> fetch continuations by originRequestId
  -> assemble execution graph
```

Request completion remains O(1) relative to total stored records, excluding append/index cost.

### 16.4 Trace assembly

The query layer must:

- Coalesce span start/completion lifecycle records by span ID.
- Build parent-child relationships.
- Preserve link relationships separately.
- Sort siblings deterministically by start time, then span ID.
- Mark orphaned/missing parents.
- Mark in-progress and abandoned spans.
- Compute critical path only from parent-child timing, not links.
- Avoid cycles caused by malformed records.
- Bound depth and total returned spans.

### 16.5 Request execution assembly

Algorithm:

1. Fetch request record by request ID.
2. Fetch root trace by request trace ID.
3. Fetch all records indexed by root trace ID.
4. Fetch continuation trace IDs indexed by origin request ID.
5. Fetch bounded records for continuation traces.
6. Group continuations by causation event/job/tool/agent.
7. Assemble summaries, errors, logs, operations, retries, and fan-out.
8. Apply query limits.
9. Return truncation metadata.

### 16.6 Late arrivals

An event or job can finish after the request detail was first loaded.

- The execution endpoint always queries current indexed state.
- The observability stream publishes continuation updates carrying origin request ID.
- Inspector can incrementally refresh the relevant execution page.
- No request record mutation is required after HTTP completion.

### 16.7 Query tests

- [ ] Direct request lookup performs index-based reads.
- [ ] Root trace and child spans assemble correctly.
- [ ] Async event/job continuations appear by origin request ID.
- [ ] Fan-out and retries group correctly.
- [ ] Legacy v1 requests still render.
- [ ] Orphan span/link data does not crash query.
- [ ] Truncation is deterministic and explicit.
- [ ] Retention removes stale secondary index entries.
- [ ] Remote runtime returns the same contract as local runtime.
- [ ] Query and stream do not expose unredacted data.

---

## 17. Inspector API and UI

### 17.1 API

Extend `@relkit/inspector-api` with:

```text
GET /_relkit/v1/requests/:requestId/execution
```

Potential stream events:

```text
request.completed
trace.updated
continuation.started
continuation.completed
job.changed
event.delivery.changed
```

Each event must contain only identifiers and safe summary data; the UI fetches full details through bounded APIs.

### 17.2 Request list

Show:

```text
method
normalized route
status
outcome
duration
start time
request ID
trace ID
continuation count
error indicator
generation
```

Do not display raw query strings or full dynamic URLs by default.

### 17.3 Request execution detail

Required sections:

1. Request summary.
2. Synchronous execution waterfall.
3. Continued-after-response section.
4. Logs correlated to selected span.
5. Errors and retry history.
6. Database/cache/bucket operation summary.
7. Events and jobs summary.
8. Runtime generation and graph identity.
9. Source links for route, middleware, function, event, job, tool, and agent descriptors.

Example:

```text
Request req_...
POST /orders
201 Created
184 ms

Synchronous execution
├── auth.require-user                          4 ms
├── orders.create                            170 ms
│   ├── INSERT orders                         21 ms
│   ├── inventory.reserve                     63 ms
│   ├── publish order.created                 12 ms
│   └── enqueue invoice.generate               8 ms
└── response serialization                     3 ms

Continued after response
├── order.created -> analytics.track           success
└── invoice.generate
    ├── attempt 1                              provider-failure
    └── attempt 2                              success
```

### 17.4 Waterfall reuse

Reuse and extend the current trace waterfall components. Do not create a separate visualization implementation for request execution.

The waterfall must visually distinguish:

```text
server
internal
client
producer
consumer
linked continuation
error
timeout
cancelled
in-progress
```

Do not hard-code color-only meaning; include icons/text/accessible labels.

### 17.5 Middleware visualization

Because authored middleware spans are inclusive:

- Label duration as inclusive.
- Show nesting based on actual parent span IDs.
- Do not subtract child duration and present it as definitive exclusive duration.
- Optionally calculate “self time estimate” with a clear label and only when intervals permit it.

### 17.6 Source lookup

Resolve source through:

```text
generationId + graphHash + descriptor ID
```

Do not persist absolute source file paths on every span.

The inspector should use the matching graph snapshot to resolve:

```text
file
line
column
descriptor kind
service/domain
```

If the generation snapshot is unavailable, show a clear “source snapshot unavailable” state rather than linking to current potentially incorrect source.

### 17.7 Inspector tests

- [ ] API contract tests for execution endpoint.
- [ ] Read-only production protection remains enforced.
- [ ] Request list displays continuation count.
- [ ] Request detail renders synchronous and asynchronous groups.
- [ ] Waterfall renders nested middleware and functions.
- [ ] Retry/fan-out grouping is correct.
- [ ] Span selection filters logs and records.
- [ ] Truncation and missing source states render safely.
- [ ] Browser tests cover one success and one failed/retried request.
- [ ] Accessibility checks cover keyboard navigation and non-color status labels.

---

## 18. OTLP and exporter behavior

### 18.1 Existing package

Modify:

```text
integrations/packages/otlp/src/runtime/exporter.ts
integrations/packages/otlp/src/runtime/exporter-support.ts
```

Do not create a competing core OTLP implementation.

### 18.2 Valid OTLP mapping

Map completed canonical records to valid OTLP/HTTP requests:

- `SpanRecordV2` -> OTLP trace span.
- `LogRecord` -> OTLP log record.
- Resource attributes -> OTLP resource.
- Span links/events/status/kind -> corresponding OTLP fields.
- Request/invocation/operation domain IDs -> span attributes.

Resource attributes should include where available:

```text
service.name
service.version
deployment.environment.name
service.instance.id
cloud.provider
cloud.region
relkit.generation.id
relkit.graph.hash
```

Do not duplicate generation/graph data at both resource and every span unless required for cross-generation query behavior. Decide mapping in OpenSpec.

### 18.3 Span start/completion coalescing

The exporter must not emit a start record as a complete OTLP span.

Choose one implementation:

1. Export only completion records because they contain the full final span; or
2. Maintain a bounded temporary start map keyed by span ID and merge at completion.

Preferred: make completion records self-contained and export them directly.

### 18.4 Recursion suppression

Exporter transport must not instrument itself.

- Execute exporter HTTP requests outside the application execution context or under an explicit suppression flag.
- Do not generate outbound HTTP spans for telemetry exporter requests.
- Add a regression test proving no infinite telemetry recursion.

### 18.5 Queue and failure behavior

Preserve:

- Bounded queues.
- Drop/failure counters.
- Flush and close deadlines.
- Failure handler diagnostics.
- Local-only diagnostic behavior for exporter failures.

Do not await exporter network completion on the request path.

### 18.6 Sampling

Keep root-consistent deterministic head sampling for ordinary external fan-out.

Correct the incomplete-error-trace problem:

- Do not export only an error record from a trace that was otherwise sampled out.
- Preferred production solution: route through an OpenTelemetry Collector with tail sampling for errors/latency.
- If RelKit keeps a local tail buffer, it must be explicitly bounded by traces, spans, bytes, and time and must never block the request.
- At minimum, mark isolated forced-export records as partial and document the limitation until full tail sampling is implemented.

Sampling does not stop context propagation. Unsampled traces must still propagate valid W3C context.

### 18.7 Exporter tests

- [ ] Completed spans map to valid OTLP fields.
- [ ] Kind/status/events/links are preserved.
- [ ] Start records are not exported as completed spans.
- [ ] Logs correlate with trace and span IDs.
- [ ] Exporter HTTP requests do not recursively instrument themselves.
- [ ] Exporter outage does not alter request/job/event behavior.
- [ ] Queue limits and drop diagnostics work.
- [ ] Trace-level sampling is consistent across related records.
- [ ] Sensitive fields remain redacted before mapping.

---

## 19. Detailed implementation phases

Every phase below must leave the repository in a valid, testable state.

## Phase 0 — Preflight, OpenSpec, and ADR

### Objective

Lock behavior and migration requirements before changing protocols.

### Tasks

- [ ] Run `git status --short` and capture overlapping changes.
- [ ] Run `openspec list` and inspect current `openspec/specs`.
- [ ] Create `openspec/changes/end-to-end-runtime-instrumentation/` using the current repository convention.
- [ ] Add `.openspec.yaml` with the correct schema/version.
- [ ] Write `proposal.md` covering problem, goals, non-goals, impact, compatibility, and rollout.
- [ ] Write `design.md` containing the identity model, context model, sync/async semantics, record model, security, sampling, and alternatives.
- [ ] Write `tasks.md` by adapting the phases in this document into OpenSpec checkbox format.
- [ ] Add delta specs for existing capabilities:
  - [ ] `observability`
  - [ ] `http-runtime`
  - [ ] `function-runtime`
  - [ ] `jobs-events`
  - [ ] `managed-resources`
  - [ ] `development-inspector`
  - [ ] `acceptance-verification`
  - [ ] Any exporter/runtime-integration capability discovered during current-spec review
- [ ] Add an ADR using the next available number under `docs/adr/`.
- [ ] Record why request ID, origin request ID, trace ID, invocation ID, and correlation ID remain separate.
- [ ] Record why durable consumers use links/new traces.
- [ ] Record why ALS complements rather than replaces Effect context.
- [ ] Record why RelKit-owned boundaries are guaranteed but arbitrary library auto-instrumentation is not.
- [ ] Run `openspec validate end-to-end-runtime-instrumentation --strict`.
- [ ] Run Prettier on the new Markdown files.

### Exit gate

- OpenSpec validates strictly.
- All affected capabilities have scenarios for success, error, timeout, cancellation, async continuation, privacy, and legacy compatibility.
- No runtime source code has been changed before the contract review is complete.

## Phase 1 — Portable IDs, W3C propagation, and model v2 skeleton

### Objective

Create the data contracts required by every later phase.

### Likely files

```text
packages/contracts/src/id.ts
packages/contracts/src/index.ts
packages/contracts/src/trace-context.ts            (new)
packages/contracts/src/propagation.ts              (new)
packages/contracts/*.test.ts

packages/observability/src/model-shared.ts
packages/observability/src/model-records.ts
packages/observability/src/model-traces.ts
packages/observability/src/model-operation.ts       (new)
packages/observability/src/index.ts
packages/observability/model.test.ts
```

### Tasks

- [ ] Add strict TraceId and SpanId generators/validators.
- [ ] Add trace flags and span context types.
- [ ] Implement `traceparent` parse/format.
- [ ] Implement bounded `tracestate` validation.
- [ ] Add causation and propagation envelope contracts.
- [ ] Add `originRequestId` type usage.
- [ ] Add `RecordContextV2`, span links, and span events.
- [ ] Add model v2 record types without enabling new writes yet.
- [ ] Add `operation` signal/type and legacy resource projection.
- [ ] Add v1/v2 record decoder tests.
- [ ] Update package exports without creating boundary violations.
- [ ] Add deterministic ID-source hooks for tests.

### Tests

- [ ] Valid sampled and unsampled `traceparent` values parse.
- [ ] Invalid length, uppercase, all-zero IDs, invalid flags, and version `ff` are rejected.
- [ ] Future-version behavior matches the design.
- [ ] Format(parse(value)) is stable for supported fields.
- [ ] Generated IDs are correct length, lowercase, and nonzero.
- [ ] Propagation envelope deep-freezes/serializes safely.
- [ ] v1 records remain admitted by compatibility reader.
- [ ] v2 model rejects unsafe or oversized fields.

### Verification

```sh
bun test packages/contracts packages/observability
bun run check
bun run typecheck
```

### Exit gate

Portable contracts exist, are validated, and no runtime behavior changed.

## Phase 2 — Ambient execution context and Effect bridge

### Objective

Propagate one immutable context through ordinary async work and Effect invocations.

### Likely files

```text
packages/runtime-effect/src/execution-context.ts      (new)
packages/runtime-effect/src/execution-context-manager.ts (new or combined)
packages/runtime-effect/src/tracing.ts
packages/runtime-effect/src/tracing-span.ts
packages/runtime-effect/src/tracing-bridge.ts
packages/runtime-effect/src/logger.ts
packages/runtime-effect/src/services.ts
packages/runtime-effect/src/runtime.ts
packages/runtime-effect/src/index.ts
packages/runtime-effect/*.test.ts

packages/invocation/src/contracts.ts
packages/invocation/src/dispatcher-context.ts
packages/invocation/src/dispatcher-scope.ts
```

### Tasks

- [ ] Add runtime-owned AsyncLocalStorage manager.
- [ ] Implement active/run/capture/bind semantics.
- [ ] Add typed parent span context separate from parent invocation ID.
- [ ] Extend `InvocationTraceContext` with request/origin/generation/graph/flags.
- [ ] Update captured trace types; remove `trace?: unknown` usage.
- [ ] Add span kind, events, links, final-name update, attributes, outcome, and idempotent completion to custom span implementation.
- [ ] Implement the current no-op span event path.
- [ ] Make logger read ambient context when Effect trace fields are absent.
- [ ] Define precedence when both ALS and Effect context exist: active child Effect span wins for span/invocation fields; request/origin/generation fields merge from ambient context.
- [ ] Ensure runtime close disables only its own ALS instance after work drains.
- [ ] Add tests for parallel isolation and captured callbacks.

### Tests

- [ ] Two concurrent contexts never observe each other's IDs.
- [ ] Nested `run()` restores parent context.
- [ ] Throw and rejected promise restore prior context.
- [ ] `setTimeout`, microtasks, and ordinary promise chains retain context.
- [ ] Bound callback runs in captured context when called elsewhere.
- [ ] Effect child span becomes active inside ALS request context.
- [ ] Logger emits merged correlation fields.
- [ ] Completed span rejects/no-ops late mutation according to design.
- [ ] Events and links are bounded.

### Verification

```sh
bun test packages/runtime-effect packages/invocation
bun run check
bun run typecheck
```

### Exit gate

Context propagation is correct independently of Hono and resource integrations.

## Phase 3 — HTTP server span and response lifecycle

### Objective

Make the inbound HTTP request the real trace root or child of a valid remote parent.

### Likely files

```text
packages/runtime-hono/src/http-propagation.ts        (new)
packages/runtime-hono/src/http-span.ts               (new)
packages/runtime-hono/src/response-finalizer.ts      (new)
packages/runtime-hono/src/create-app.ts
packages/runtime-hono/src/middleware.ts
packages/runtime-hono/src/middleware-utils.ts
packages/runtime-hono/src/request-record-middleware.ts
packages/runtime-hono/src/request-record-utils.ts
packages/runtime-hono/src/materialize-routes.ts
packages/runtime-hono/src/materialize-routes-utils.ts
packages/runtime-hono/src/request-context.ts
packages/runtime-hono/*.test.ts
```

### Tasks

- [ ] Introduce execution-context middleware before all existing framework middleware.
- [ ] Fold W3C extraction and local request identity into it.
- [ ] Default to a new local request ID and origin request ID.
- [ ] Add explicit trusted incoming correlation policy hook.
- [ ] Create provisional HTTP server span.
- [ ] Add request accepted event.
- [ ] Update span name and route attributes after match.
- [ ] Pass real parent span context into engine invocation.
- [ ] Remove automatic `correlationId=requestId` for new requests.
- [ ] Preserve compatibility response headers where documented.
- [ ] Build idempotent response finalizer.
- [ ] Wrap streaming bodies and bind callbacks to captured context.
- [ ] Instrument raw, RPC, MCP, static, internal, and unmatched routes.
- [ ] Preserve limit/auth/rate-limit behavior and ordering.
- [ ] Stop request completion from reading the entire sink; if index migration is not ready, keep compatibility behind a temporary adapter clearly marked for removal in Phase 8.

### Tests

- [ ] 200 buffered response.
- [ ] 204 response.
- [ ] HEAD response.
- [ ] 404 and 405.
- [ ] Input validation failure.
- [ ] Auth failure before route handler.
- [ ] Rate limit response.
- [ ] Body limit response.
- [ ] Handler defect.
- [ ] Timeout.
- [ ] Client abort.
- [ ] Stream close.
- [ ] Stream error.
- [ ] Stream cancellation.
- [ ] Valid incoming remote parent.
- [ ] Invalid incoming context creates a fresh trace.
- [ ] Untrusted incoming request/origin IDs are ignored.
- [ ] Response contains local request ID.
- [ ] Root span completes exactly once.

### Verification

```sh
bun test packages/runtime-hono
bun run test:integration
bun run check
bun run typecheck
```

### Exit gate

Every HTTP path has exactly one server span, and the target function is a real descendant.

## Phase 4 — Invocation parentage, authored middleware, lifecycle, and logs

### Objective

Make function/middleware/log structure correct under the HTTP root and direct calls.

### Likely files

```text
packages/invocation/src/contracts.ts
packages/invocation/src/context.ts
packages/engine/src/invoke.ts
packages/engine/src/invoke-types.ts
packages/engine/src/invoke-utils.ts
packages/engine/src/invoke-runtime.ts
packages/engine/src/invoke-tracing.ts
packages/engine/src/context.ts
packages/runtime-hono/src/route-middleware.ts
packages/runtime-hono/src/materialize-routes-utils.ts
packages/runtime-effect/src/logger.ts
```

### Tasks

- [ ] Finalize typed `InvocationParent` migration.
- [ ] Add request/origin fields to invocation metadata and records.
- [ ] Derive parent from active execution context when explicit parent is absent.
- [ ] Preserve direct invocation scope precedence.
- [ ] Make authored middleware an active internal span.
- [ ] Convert mapping/lifecycle timing details to span events by default.
- [ ] Ensure direct child function inherits active child span and parent invocation ID.
- [ ] Update hook observers and canonical span records.
- [ ] Make logs inherit correct middleware/function span.
- [ ] Add optional `ctx.trace` implementation and types if approved in OpenSpec.
- [ ] Remove temporary duplicate request timeline timing.

### Tests

- [ ] HTTP -> middleware -> middleware -> function parent chain.
- [ ] HTTP -> function without middleware.
- [ ] Function -> direct child function.
- [ ] Standalone function invocation remains a root trace.
- [ ] Event/job invocation can supply consumer parent context later.
- [ ] Parent invocation field absent for HTTP parent and present for direct child.
- [ ] Lifecycle failures complete the function span correctly.
- [ ] Logs use the deepest active span.
- [ ] Parallel middleware/function calls remain isolated.

### Verification

```sh
bun test packages/invocation packages/engine packages/runtime-hono packages/runtime-effect
bun run test:integration
bun run check
bun run typecheck
```

### Exit gate

The synchronous request trace is structurally correct before adding resource and async detail.

## Phase 5 — Logical operation observer, cache, bucket, and database

### Objective

Instrument every supported RelKit resource operation as a child of the active span.

### Likely files

```text
packages/runtime-effect/src/operation-observer.ts    (new)
packages/engine/src/dependency-bridge.ts
packages/engine/src/dependency-clients.ts
packages/engine/src/context.ts
packages/engine/src/invoke-types.ts
packages/engine/src/observability.ts

packages/buckets/src/client-types.ts
packages/buckets/src/client.ts
packages/cache/src/client-types.ts
packages/cache/src/client.ts

packages/drizzle/src/runtime-types.ts
packages/drizzle/src/operations.ts
packages/drizzle/src/context.ts
packages/drizzle/src/activation.ts

packages/observability/src/model-operation.ts
packages/observability/src/collector-records.ts
```

### Tasks

- [ ] Implement common operation observer.
- [ ] Adapt current dependency bridge to it.
- [ ] Emit one operation record per logical operation.
- [ ] Upgrade cache metadata/hit behavior.
- [ ] Upgrade bucket metadata/byte behavior.
- [ ] Inject observer into Drizzle activation/context.
- [ ] Wrap logical model operations.
- [ ] Wrap transactions.
- [ ] Map all operation failures without replacing errors.
- [ ] Keep legacy operation hooks as compatibility adapters.
- [ ] Add strict privacy snapshot tests.
- [ ] Confirm no duplicate logical spans.

### Verification

```sh
bun test packages/buckets packages/cache packages/drizzle packages/engine packages/observability
bun run test:packages
bun run test:integration
bun run test:security
bun run check
bun run typecheck
```

### Exit gate

Database, cache, and bucket operations are visible and safely correlated.

## Phase 6 — Event producer/consumer propagation

### Objective

Preserve causal identity through event publication, delivery, retries, replay, and fan-out.

### Likely files

```text
packages/functions/src/clients.ts
packages/events/src/client.ts
packages/events/src/client-utils.ts
packages/events/src/define-event.ts
packages/engine/src/event-client.ts
packages/engine/src/event-invocation.ts
packages/engine/src/materialize-events.ts
packages/providers-local/src/events/delivery-types.ts
packages/providers-local/src/events/delivery.ts
packages/providers-local/src/events/router-records.ts
packages/providers-local/src/events/*store* or validation files
packages/observability/src/model-records.ts
```

Also locate and update every non-local event provider implementing current event capability contracts.

### Tasks

- [ ] Add reserved propagation metadata to internal event provider contracts.
- [ ] Create producer publication span.
- [ ] Inject producer context into envelope metadata.
- [ ] Persist metadata in local durable delivery.
- [ ] Add synchronous/ephemeral provider capability declaration.
- [ ] Start durable consumer trace with producer link.
- [ ] Parent target event function under consumer span.
- [ ] Add fan-out identities and query fields.
- [ ] Add retry/replay links and records.
- [ ] Add legacy envelope compatibility.
- [ ] Update admin/replay APIs and tests.

### Verification

```sh
bun test packages/events packages/engine packages/providers-local
bun run test:packages
bun run test:integration
bun run test:restart
bun run check
bun run typecheck
```

### Exit gate

A request lookup can eventually discover all event continuations through stored causal metadata.

## Phase 7 — Job producer/consumer propagation and retries

### Objective

Preserve causal identity through job enqueue, durable storage, attempts, retries, admin retry, and dead-lettering.

### Likely files

```text
packages/functions/src/clients.ts
packages/jobs/src/client.ts
packages/jobs/src/client-utils.ts
packages/engine/src/job-client.ts
packages/engine/src/materialize-jobs-types.ts
packages/engine/src/materialize-jobs-binding.ts
packages/engine/src/materialize-jobs-retry.ts
packages/providers-local/src/jobs/queue-utils.ts
packages/providers-local/src/jobs/queue.ts
packages/providers-local/src/jobs/store.ts
packages/providers-local/src/jobs/retry.ts
packages/observability/src/model-records.ts
```

Also locate and update every non-local queue/job provider implementing current contracts.

### Tasks

- [ ] Add propagation metadata to queue entry/enqueue contracts.
- [ ] Create enqueue producer span.
- [ ] Persist metadata through all queue states.
- [ ] Create consumer span per worker attempt.
- [ ] Parent function under attempt span.
- [ ] Link attempts to enqueue producer.
- [ ] Record retry scheduling and classification.
- [ ] Preserve context through admin retry and restart.
- [ ] Handle legacy entries without propagation.
- [ ] Add scheduled-job root semantics.

### Verification

```sh
bun test packages/jobs packages/engine packages/providers-local
bun run test:packages
bun run test:integration
bun run test:restart
bun run check
bun run typecheck
```

### Exit gate

Job attempts and retries are independently visible and causally linked to enqueue/request origin.

## Phase 8 — Persistence, secondary indexes, and execution queries

### Objective

Make request execution lookup efficient, complete, and capable of late continuations.

### Likely files

```text
packages/observability/src/collector-events.ts
packages/observability/src/collector-records.ts
packages/observability/src/record-admission.ts
packages/observability/src/request-record.ts
packages/observability/src/request-details.ts
packages/observability/src/query-types.ts
packages/observability/src/query-utils.ts
packages/observability/src/query-validation.ts
packages/observability/src/query.ts
packages/observability/src/storage/index-types.ts
packages/observability/src/storage/index-state.ts
packages/observability/src/storage/index-files.ts
packages/observability/src/storage/index.ts
packages/observability/src/storage/segments.ts
packages/observability/src/local/duckdb-query.ts
packages/observability/src/runtime.ts
packages/observability/src/remote-runtime.ts
```

### Tasks

- [ ] Enable v2 writes after all producers are ready.
- [ ] Add secondary index fields.
- [ ] Add index migration/rebuild logic.
- [ ] Coalesce span lifecycle records.
- [ ] Add request execution query.
- [ ] Remove request-finish full-store scanning.
- [ ] Add origin-request continuation lookup.
- [ ] Add deterministic truncation.
- [ ] Add stream updates for continuation changes.
- [ ] Keep local and remote query contracts identical.
- [ ] Keep legacy request detail adapter during compatibility window.

### Verification

```sh
bun test packages/observability packages/inspector-api
bun run test:integration
bun run test:restart
bun run test:inspector
bun run check
bun run typecheck
```

### Exit gate

Request detail is index-backed and includes all currently persisted continuations.

## Phase 9 — Inspector execution experience

### Objective

Make the causal graph usable for runtime debugging.

### Likely files

```text
packages/inspector-api/src/observability.ts
packages/inspector-api/src/observability-utils.ts
packages/inspector-api/*.test.ts

apps/inspector/app/requests/page.tsx
apps/inspector/app/requests/[requestId]/page.tsx
apps/inspector/app/trace-waterfall.tsx
apps/inspector/app/trace-waterfall-rows.tsx
apps/inspector/app/logs/*
apps/inspector/lib/*
apps/inspector/hooks/*
```

### Tasks

- [ ] Read current Next.js documentation under installed `node_modules` as required.
- [ ] Add execution endpoint client and types.
- [ ] Extend request list.
- [ ] Build request execution detail view.
- [ ] Reuse waterfall components.
- [ ] Add linked-continuation grouping.
- [ ] Add retries/fan-out UI.
- [ ] Add span-correlated logs and error panels.
- [ ] Add source resolution from graph generation.
- [ ] Add live refresh from stream events.
- [ ] Add loading, empty, truncated, legacy, and missing-source states.
- [ ] Add browser/accessibility tests.

### Verification

```sh
bun run test:inspector
bun run test:inspector:browser
bun run test:e2e
bun run check
bun run typecheck
```

### Exit gate

A developer can diagnose the full acceptance scenario from one request page.

## Phase 10 — OTLP, sampling, exporter hardening

### Objective

Export valid correlated telemetry without impacting application work.

### Likely files

```text
packages/observability/src/telemetry-config.ts
packages/observability/src/telemetry-sampling.ts
packages/observability/src/telemetry-exporter-*.ts
packages/observability/src/runtime.ts
packages/observability/src/remote-runtime.ts
packages/app/src/define-app-types.ts

integrations/packages/otlp/src/runtime/exporter.ts
integrations/packages/otlp/src/runtime/exporter-support.ts
integrations/packages/otlp/*.test.ts
```

### Tasks

- [ ] Add propagation/instrumentation/limits config normalization.
- [ ] Add exact-option validation and defaults.
- [ ] Map v2 completed spans/logs to OTLP.
- [ ] Add resource attributes.
- [ ] Add recursion suppression.
- [ ] Preserve batching/backpressure/failure stats.
- [ ] Correct partial error-trace sampling behavior.
- [ ] Add exporter compatibility tests.
- [ ] Update Sentry integration only where canonical record changes require it.
- [ ] Document Collector tail-sampling recommendation.

### Verification

```sh
bun test packages/observability integrations/packages/otlp
bun run test:packages
bun run test:integration
bun run test:security
bun run check
bun run typecheck
```

### Exit gate

External export is standards-compatible, bounded, non-recursive, and failure-isolated.

## Phase 11 — Acceptance fixture, performance, migration, and release

### Objective

Prove the whole system, document it, and prepare a safe release.

### Tasks

- [ ] Add the end-to-end acceptance fixture from Section 20.
- [ ] Add benchmark cases for request throughput, span volume, ALS overhead, record append, index lookup, and execution query.
- [ ] Add memory-pressure tests for incomplete spans, links, events, and exporter queues.
- [ ] Add security fixtures containing synthetic secrets in every prohibited field.
- [ ] Update `examples/commerce` to exercise the feature without manual IDs.
- [ ] Update templates only through their source/generator path.
- [ ] Update docs:
  - [ ] architecture
  - [ ] getting started/configuration where applicable
  - [ ] testing
  - [ ] troubleshooting
  - [ ] inspector guide
  - [ ] telemetry/export guide
- [ ] Add migration documentation for trace IDs, request correlation, record v2, event envelopes, job queue entries, and config.
- [ ] Add a changeset for every publishable package affected.
- [ ] Update changelog/release evidence according to repository policy.
- [ ] Mark OpenSpec tasks complete only after their evidence exists.
- [ ] Run strict OpenSpec validation.
- [ ] Run all final repository gates.

### Final verification

```sh
bun install --frozen-lockfile
bun test tests/phase0.test.ts
bun run lint
bun run check
bun run typecheck
bun run test:types
bun run test:packages
bun run test:unit
bun run test:compiler
bun run test:contracts
bun run test:integration
bun run test:restart
bun run test:inspector
bun run test:generator
bun run test:examples
bun run test:docs
bun run test:security
bun run build
bun run verify
```

Run environment-dependent gates when authorized and available:

```sh
bun run test:container
bun run test:local-docker
bun run test:deployment
bun run test:inspector:browser
bun run test:e2e
bun run prepush
```

Do not run paid cloud acceptance without explicit authorization.

### Exit gate

The Definition of Done in Section 25 is fully satisfied.

---

## 20. Mandatory end-to-end acceptance scenario

Create one canonical fixture in `examples/commerce` and/or `tests/integration` that performs exactly this flow:

```text
POST /orders
  -> auth middleware
  -> rate-limit middleware
  -> createOrder function
     -> database insert
     -> cache invalidation
     -> reserveInventory direct child function
        -> database update
     -> order.created event publication
     -> invoice.generate job enqueue
  <- 201 response

order.created durable delivery
  -> analytics function
     -> database insert

invoice.generate attempt 1
  -> bucket operation
  -> provider failure
  -> retry scheduled

invoice.generate attempt 2
  -> bucket operation
  -> success
```

### Required assertions

| Concern | Assertion |
| --- | --- |
| HTTP root | Exactly one server span |
| W3C format | Trace and span IDs are valid, nonzero lowercase hex |
| Middleware | Two nested/in-order authored middleware spans |
| Function | `orders.create` is descendant of HTTP/middleware span |
| Direct call | `inventory.reserve` has parent invocation `orders.create` |
| Database | Insert/update operations are children of correct invocation |
| Cache | Invalidation is child of `orders.create` and contains no key/value |
| Event publication | Producer span ends before durable delivery begins |
| Event delivery | Consumer trace links to producer and preserves origin request |
| Job enqueue | Producer span and propagation metadata exist |
| Job attempt 1 | Consumer trace links to enqueue and records provider failure |
| Retry | Attempt 2 uses new span/invocation and stable job instance ID |
| Bucket | Operation is child of each job attempt and contains no object key |
| HTTP boundary | Request/server span ends at response completion, before delayed work finishes |
| Logs | Every in-context log has correct trace/span/request/origin fields |
| Query | Request execution endpoint returns root trace plus all continuations |
| Inspector | One page renders synchronous work and continued-after-response work |
| Source | Descriptor IDs resolve through matching generation and graph |
| Privacy | No body, payload, SQL values, keys, secrets, or authorization data |
| Failure isolation | Exporter outage does not change HTTP, event, job, or retry result |
| Concurrency | Parallel acceptance runs do not mix IDs |
| Restart | Event/job propagation survives local provider restart |

Store expected trace relationships as explicit assertions, not broad snapshots alone.

---

## 21. Migration and backward compatibility

### 21.1 Trace IDs

- New runtime-generated traces use W3C-compatible IDs.
- Historical `trace-<uuid>` records remain queryable.
- Historical IDs are never injected into `traceparent`.
- Inspector marks legacy traces when useful.

### 21.2 HTTP headers

- `x-request-id` remains the local support identifier response header.
- `x-trace-id` may remain response-only during deprecation if existing clients use it.
- `traceparent` and `tracestate` become the propagation source of truth.
- Incoming arbitrary request/origin IDs are ignored by default.

### 21.3 Correlation ID

- Stop setting `correlationId=requestId` for new HTTP invocations.
- Add `originRequestId` to replace framework causal use.
- Legacy query adapters recognize old correlation behavior.
- Application-supplied correlation IDs remain unchanged.

### 21.4 Record version

- Read v1 and v2.
- Write v2 after the transition point.
- Do not rewrite historical segments in place without a separate migration tool and backup strategy.
- Rebuild indexes from segments when necessary.

### 21.5 Event envelopes

- Accept legacy event envelopes lacking reserved propagation.
- Start a fresh consumer trace for legacy delivery.
- Preserve current public event payload contract.
- Version internal propagation separately from event contract version.

### 21.6 Job queue entries

- Accept legacy entries without propagation.
- Preserve new metadata through all transitions.
- Do not make a missing legacy envelope a reason to dead-letter a valid job.

### 21.7 Public configuration

- Existing telemetry configuration remains valid with safe defaults.
- Unknown options continue to fail.
- New options are optional and normalized.
- Generated templates use defaults unless an example needs explicit configuration.

### 21.8 Inspector/API

- Keep existing request and trace endpoints during compatibility window.
- Add execution endpoint rather than breaking old clients immediately.
- Version any changed response shapes through the existing inspector protocol mechanism.

---

## 22. Failure modes and required behavior

| Failure | Required behavior |
| --- | --- |
| Invalid `traceparent` | Ignore it, discard dependent `tracestate`, create a new trace |
| Invalid trusted request ID | Generate a new local request ID |
| ALS context absent | Safe standalone behavior; no crash |
| Effect trace absent | Use active ALS span or create documented root |
| Span observer throws | Swallow and continue application work |
| Collector rejects record | Emit bounded diagnostic if possible; do not fail operation |
| Local store unavailable | Continue with bounded memory/diagnostic according to existing runtime policy |
| Index write fails | Preserve segment append if possible; mark index unhealthy and recover/rebuild |
| Exporter unavailable | Queue/retry/drop per policy; application continues |
| Exporter queue full | Drop according to policy and increment counters; do not block request |
| Event propagation missing | Deliver under fresh trace, no origin request, optional diagnostic |
| Job propagation missing | Execute legacy job under fresh trace |
| Malformed propagation metadata | Ignore metadata, do not expose it to handler, continue safely when payload is valid |
| Stream cancelled | Complete server span as cancelled exactly once |
| Process shutdown | Drain accepted work, mark unfinished spans, flush telemetry within bound |
| Generation switch | New work uses new generation context; old in-flight work retains old generation identity |
| Clock anomaly | Duration clamps to nonnegative and records diagnostic if severe |
| Excess events/links/attributes | Truncate deterministically and record dropped counts |
| Causal cycle in malformed records | Query breaks cycle and marks data malformed; no recursion crash |

---

## 23. Performance and memory budgets

The final numeric thresholds must be established by baseline measurement, but the implementation must provide measurable budgets.

### 23.1 Hot-path constraints

- No full-store scan on request completion.
- No exporter flush on request completion.
- No synchronous network export.
- No request body cloning solely for telemetry.
- No serialization of user input/output for size measurement unless already available safely.
- No raw SQL parsing on the default logical database path.
- No unbounded array of events, links, attributes, or pending spans.
- No one-ALS-instance-per-request allocation.
- No observer exception propagation into application code.

### 23.2 Required benchmark comparisons

Measure before and after on the same machine/environment:

```text
no-op HTTP request throughput
HTTP request with one function
HTTP request with two middleware layers
function with 10 cache operations
function with 10 database operations
function with event + job enqueue
100 concurrent requests
trace query for 100, 500, and maximum spans
origin request query with 10 and 100 continuations
exporter unavailable with full queue
```

Record:

```text
requests/sec
p50/p95/p99 latency
CPU time
heap growth
records/request
bytes/request
query latency
export queue drops
```

### 23.3 Regression policy

OpenSpec must define an accepted budget. Suggested starting review thresholds, subject to baseline evidence:

- Median no-op HTTP overhead remains below 5%.
- p95 no-op HTTP overhead remains below 10%.
- Heap does not grow unbounded after completed traces and retention cleanup.
- Request execution query remains bounded and index-based.

Do not hard-code these as release guarantees until measurements are checked in.

---

## 24. Security and privacy review checklist

- [ ] Incoming request and origin IDs are untrusted by default.
- [ ] W3C sampling flags cannot force unbounded local capture.
- [ ] `tracestate` size/count rules are enforced.
- [ ] Propagation envelope size is bounded.
- [ ] User payloads do not contain reserved telemetry metadata.
- [ ] Request/response bodies are absent from records.
- [ ] Authorization and cookies are absent.
- [ ] Database selectors/mutations/rows/parameters are absent.
- [ ] Cache keys and values are absent.
- [ ] Bucket keys, signed URLs, metadata values, and contents are absent.
- [ ] Event and job payloads are absent.
- [ ] Agent prompts/model output/tool arguments are absent by default.
- [ ] Redaction happens before local persistence and export.
- [ ] Error fallback paths remain redacted.
- [ ] Inspector production endpoints retain authorization requirements.
- [ ] Source links do not expose host-absolute paths remotely.
- [ ] Exporter recursion is impossible.
- [ ] Synthetic-secret scan covers every new record/event/attribute field.
- [ ] Retention deletion removes secondary index references.

---

## 25. Definition of Done

The feature is complete only when all statements below are true.

### Architecture

- [ ] There is one canonical execution context and observability pipeline.
- [ ] HTTP, invocation, resources, events, and jobs use the same trace/span contracts.
- [ ] Parent span and parent invocation identities are modeled separately.
- [ ] Durable asynchronous work uses links/new traces by default.
- [ ] No duplicate request timeline store is required.

### Runtime behavior

- [ ] Every inbound HTTP request creates exactly one server span.
- [ ] Every authored middleware creates one active internal span.
- [ ] Every function invocation creates one invocation span.
- [ ] Direct calls create correctly parented child invocation spans.
- [ ] Database, cache, and bucket operations create safe operation spans.
- [ ] Event publication and job enqueue create producer spans.
- [ ] Durable delivery and worker attempts create consumer spans.
- [ ] Retries create distinct spans and invocations.
- [ ] Logs automatically correlate to the deepest active span.
- [ ] Streaming requests complete spans at the actual stream boundary.

### Query and inspector

- [ ] Request lookup is index-based.
- [ ] One request page shows synchronous and asynchronous work.
- [ ] Fan-out, retries, failures, logs, and operations are navigable.
- [ ] Late continuations appear without mutating the completed request record.
- [ ] Legacy records remain readable.
- [ ] Source links resolve against the correct generation graph.

### Safety

- [ ] Telemetry failures never alter application behavior.
- [ ] Every span completes exactly once or is explicitly marked abandoned.
- [ ] Context does not leak across concurrent work.
- [ ] Sensitive payloads/keys/parameters are absent by default.
- [ ] Limits prevent unbounded telemetry memory/storage growth.
- [ ] Exporter transport does not recursively instrument itself.

### Verification

- [ ] OpenSpec validates strictly.
- [ ] Focused package tests pass.
- [ ] Integration and restart suites pass.
- [ ] Inspector API/browser tests pass.
- [ ] Security tests pass.
- [ ] Build passes.
- [ ] `bun run verify` passes.
- [ ] Environment-dependent required gates are recorded honestly.
- [ ] Changesets and migration documentation are included.

---

## 26. Recommended pull-request sequence

Do not combine these into one pull request unless maintainers explicitly request it.

| PR | Scope | Must remain backward-compatible? |
| --- | --- | --- |
| 1 | OpenSpec, ADR, contract test fixtures | Yes |
| 2 | W3C IDs, propagation contracts, model v2 types/readers | Yes |
| 3 | AsyncLocalStorage manager and Effect bridge | Yes |
| 4 | HTTP server span and streaming finalization | Yes, with header compatibility |
| 5 | Invocation parent correction, middleware spans, logger correlation | Transitional compatibility |
| 6 | Operation observer plus cache/bucket | Yes |
| 7 | Drizzle logical operations and transactions | Yes |
| 8 | Event producer/consumer propagation | Legacy envelopes readable |
| 9 | Job producer/consumer propagation and queue migration | Legacy entries readable |
| 10 | Secondary indexes and execution query | Existing endpoints preserved |
| 11 | Inspector request execution experience | Existing pages preserved |
| 12 | OTLP mapping, config, sampling hardening | Existing config valid |
| 13 | Acceptance fixture, performance, docs, changesets, release evidence | Final |

Each PR description should include:

```text
OpenSpec tasks addressed
public API changes
record/protocol changes
migration behavior
focused tests run
full checks run or deferred
performance/security impact
follow-up tasks
```

---

## 27. Codex task execution checklist

Use this checklist at the start and end of every implementation session.

### Before editing

- [ ] Read relevant AGENTS files.
- [ ] Inspect current git status.
- [ ] Confirm current commit/path drift.
- [ ] Read relevant OpenSpec requirements and scenarios.
- [ ] Identify existing tests closest to the behavior.
- [ ] State which phase/task is being implemented.
- [ ] Confirm no later-phase dependency is being pulled in accidentally.

### During editing

- [ ] Keep files <= 200 lines.
- [ ] Keep public API and internal runtime types separate.
- [ ] Add focused tests with each change.
- [ ] Use deterministic clocks/ID sources in tests.
- [ ] Avoid arbitrary sleeps.
- [ ] Keep records JSON-safe and deeply immutable where current conventions require it.
- [ ] Do not capture user values.
- [ ] Keep observer failures isolated.
- [ ] Run `bun run check` after package-boundary edits.
- [ ] Update OpenSpec tasks only when evidence exists.

### Before finishing a phase

- [ ] Run focused tests.
- [ ] Run `bun run check`.
- [ ] Run `bun run typecheck`.
- [ ] Run phase-specific integration/restart/security tests.
- [ ] Run `git diff --check`.
- [ ] Review the diff for generated files and accidental secrets.
- [ ] Review record snapshots for prohibited values.
- [ ] Confirm no context leaks or duplicate spans.
- [ ] Update docs and changeset when the public contract changed.
- [ ] Report skipped environment-dependent checks honestly.

---

## 28. Final target behavior summary

After implementation, RelKit's runtime model is:

```text
Automatic Runtime Instrumentation
  = W3C trace propagation
  + local request identity
  + origin request causation
  + ambient AsyncLocalStorage context
  + Effect invocation context
  + automatic spans at RelKit boundaries
  + span events for short phases
  + links for durable asynchronous continuations
  + correlated logs/domain records
  + bounded redacted storage and export
  + request-centric inspector execution graph
```

The implementation order is intentionally dependency-first:

```text
OpenSpec and contracts
  -> ambient context
  -> HTTP root
  -> function/middleware parentage
  -> logical operations
  -> events/jobs propagation
  -> indexes and execution query
  -> inspector
  -> exporter and sampling hardening
  -> acceptance, performance, security, migration, release
```

Do not start with database or provider spans before the HTTP root and ambient parent context exist. Otherwise RelKit will create more disconnected telemetry and later need to migrate it again.

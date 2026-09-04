## Purpose

Defines correlated, bounded, queryable, and secret-safe runtime records for requests, invocations, managed operations, logs, traces, diagnostics, and live development updates.

## Requirements

### Requirement: Complete correlated runtime signals

The observability capability SHALL record request lifecycles, function invocations, route rate-limit decisions, job attempts, event publications/deliveries, bucket/cache operations, tool calls, agent model turns, structured logs, spans/traces, diagnostics, and generation lifecycle events with shared correlation identifiers.

#### Scenario: HTTP flow causes child work

- **WHEN** a request passes rate limiting, invokes a function, accesses cache, publishes an event, and enqueues a job
- **THEN** rate-limit decision, request, invocation, operations, logs, and spans share the correct request/trace/invocation relationships

#### Scenario: HTTP flow is rate limited

- **WHEN** a request is rejected before target invocation
- **THEN** one safe request record and trace capture the `429` outcome without fabricating a function invocation

### Requirement: Stable request record and timeline

Requests SHALL use version 2 start and authoritative completion records. Terminal timestamps, status, route, function and invocation references SHALL remain absent until known. The request lifecycle SHALL be derived from canonical spans and timestamped events, not a persisted request timeline.

#### Scenario: Declared route failure completes

- **WHEN** a target returns a declared error
- **THEN** completion contains the configured status, declared-error outcome, safe error identity, and correlated spans/events preserving all previously executed steps

#### Scenario: Request is still running

- **WHEN** HTTP handling starts but has not produced a response
- **THEN** its request and active server span are queryable without fabricated terminal fields

### Requirement: Redaction precedes every sink

Secrets and configured sensitive fields SHALL be redacted before a record enters in-memory retention, terminal output, production JSON, local files, query APIs, SSE, inspector HTML, or browser responses.

#### Scenario: Synthetic secrets cross all flows

- **WHEN** request, function, event, job, bucket/cache, and agent flows contain the synthetic password, bearer token, cookie, and API key used by security tests
- **THEN** recursive scans of every observable sink find none of the raw secret values

### Requirement: Conservative capture defaults

Request/response bodies, invocation and operation input/output, authorization headers, cookies, binary data, environment secrets, and agent prompt/result content SHALL NOT be captured by default; development capture SHALL require explicit redacted mode, bounded byte size, and configured key redaction.

#### Scenario: Default request contains credentials

- **WHEN** an HTTP request carries authorization, cookie, and JSON body fields
- **THEN** its metadata can be recorded but protected headers/cookies and body content are absent

#### Scenario: Redacted development capture is enabled

- **WHEN** a development configuration enables capture with a byte limit and redaction keys
- **THEN** validated invocation and operation inputs/results are captured once, content is truncated to the limit, and sensitive keys are removed before storage

### Requirement: Bounded repairable local storage

Local observability SHALL use append-only segments with atomic rotation, bounded retention by time and total size, query indexes, and startup repair/quarantine for truncated or malformed records.

#### Scenario: Final segment is truncated

- **WHEN** startup finds an incomplete last NDJSON line after a crash
- **THEN** it repairs or quarantines only the invalid tail while retaining complete prior records

#### Scenario: Retention bound is exceeded

- **WHEN** age or byte limits are exceeded
- **THEN** the oldest eligible segments and index entries are removed without unbounded memory growth

### Requirement: Versioned bounded query APIs

Request, log, and trace queries SHALL support stable bounded pagination/cursors plus relevant time, severity, route, function, outcome, request, and trace filters; detail endpoints SHALL return only redacted versioned records.

#### Scenario: Requests are paginated

- **WHEN** a client queries more records than the configured page size
- **THEN** the API returns a bounded page and stable continuation cursor without duplicates for the retained snapshot semantics

### Requirement: Cursor-based live SSE

The live stream SHALL publish the defined request, log, span, job, event, generation, and diagnostic event types with monotonic cursors, reconnect replay within retention, bounded buffering, backpressure behavior, and a dropped-event counter.

#### Scenario: Inspector reconnects

- **WHEN** an SSE client reconnects with its last observed cursor still in retention
- **THEN** the backend replays missed events in order before continuing live delivery

#### Scenario: Consumer is too slow

- **WHEN** a stream consumer exceeds bounded buffering
- **THEN** the runtime applies documented dropping/backpressure behavior and increments an observable counter instead of growing memory indefinitely

### Requirement: Human and production log formats

Development SHALL offer correlated human-readable logs and production SHALL offer structured JSON logs with level filtering, component annotation, timing, and safe fields; both SHALL be outputs of the internal logging service.

#### Scenario: Production request completes

- **WHEN** JSON logging is active and a request completes
- **THEN** one structured completion record contains timestamp, level, component, request/trace IDs, route, status, and duration without secret content

### Requirement: Rate-limit telemetry is bounded and correlated

Rate-limit decisions SHALL add bounded low-cardinality request/span fields for route, outcome, configured limit, remaining count, and reset time without recording raw keys or secret request values.

#### Scenario: Request is rate limited

- **WHEN** a route rejects a request with `429`
- **THEN** its request record and trace identify the rate-limit outcome and policy metadata without exposing the derived key

### Requirement: Trace presentation uses existing safe contracts

Inspector trace visualization SHALL derive hierarchy, timing, status, attributes, and correlated links from versioned redacted trace/query APIs and SHALL NOT require application handlers, live span objects, or an alternate telemetry store.

#### Scenario: Trace detail is loaded

- **WHEN** the inspector requests a trace
- **THEN** all displayed content comes from the existing protected redacted API contract and does not mutate telemetry state

### Requirement: Service identity is attached without context leakage

Invocations, structured logs, spans, traces, and inspector records for a service member SHALL include stable service and member-function identities, while enriched service-context values SHALL remain uncaptured unless an existing explicit bounded and redacted capture rule permits them.

#### Scenario: Service member logs

- **WHEN** `OrderService.getOrder` emits an application log
- **THEN** the log identifies the service, function, invocation, and trace without automatically serializing principal, tenant, request, or middleware context

#### Scenario: Standalone service member runs

- **WHEN** a service-scoped member is invoked through the standalone kernel
- **THEN** its lifecycle and log records retain service attribution even without an HTTP request or application provider set

### Requirement: Dynamic function calls are observable relationships

Function descriptor calls SHALL emit bounded observed relationships and correlated parent/child invocation records without being inserted into the canonical declared graph.

#### Scenario: Function invokes sibling service member

- **WHEN** one service member invokes another through `invoke`
- **THEN** telemetry records the caller, callee, service, parent/child IDs, and shared trace ID and leaves the graph hash unchanged

#### Scenario: Dynamic cycle is rejected

- **WHEN** runtime invocation-chain protection rejects a function-call cycle
- **THEN** the attempted observed edge and safe policy failure remain correlated for diagnosis without exposing handler internals

### Requirement: Inspector persistence precedes external sampling

Every admitted record SHALL be redacted before bounded local persistence and streaming. External sampling SHALL be deterministic per trace and apply consistently to its spans, logs and errors; errors SHALL NOT force partial trace exports. Unassociated diagnostics SHALL remain independently exportable.

#### Scenario: Trace is excluded from external export

- **WHEN** trace-level sampling excludes a trace, including one containing an error
- **THEN** its retained local execution remains queryable but no associated span or log is exported

### Requirement: Exporters fan out independently

An application SHALL configure zero or more statically loaded telemetry exporters, including Sentry and OTLP concurrently; exporter failure, backpressure, or bounded queue overflow SHALL not fail application work, block another exporter, or delete the canonical local record.

#### Scenario: OTLP exporter fails

- **WHEN** OTLP export fails while Sentry is healthy
- **THEN** Sentry continues, application work completes, and a redacted local-only diagnostic appears in Inspector without recursively entering OTLP

### Requirement: Export buffering has one owner

Sentry SHALL delegate buffering and bounded flush to its SDK integration, while OTLP SHALL use one bounded RelKit export queue with deterministic overflow and shutdown behavior.

#### Scenario: Runtime shuts down with queued export work

- **WHEN** the bounded flush deadline expires
- **THEN** shutdown reports safe dropped-export counters and completes without delaying application drain indefinitely

### Requirement: CloudWatch Logs is host routing

CloudWatch Logs SHALL NOT be an application telemetry exporter; an AWS host SHALL route the redacted structured production stdout sink through its logging configuration without duplicating it through an in-process CloudWatch client.

#### Scenario: AWS application emits a structured log

- **WHEN** the production host is configured for CloudWatch Logs
- **THEN** the redacted stdout record is routed by the host and no CloudWatch exporter integration is loaded

### Requirement: Canonical bounded span lifecycle

The current record model SHALL be version 2 only, use operation instead of resource signals, and identify spans by trace ID and span ID independently from invocation identity. Spans SHALL contain kind, timestamps, status/outcome, scalar attributes, events, links, optional correlation fields and dropped counts. Updates SHALL have increasing revisions and completion SHALL be authoritative. Defaults SHALL bound local traces to 512 spans, attributes to 64, events to 32, links to 64, intermediate updates to 64, attribute values to 1024 bytes and simultaneously recording spans to 4096. Names and keys SHALL be bounded.

#### Scenario: Capture reaches a limit

- **WHEN** a span or trace exceeds a recording limit
- **THEN** context still propagates, recorded spans retain completion snapshots, dropped counts are exposed, and application work is unaffected

#### Scenario: Older state is opened

- **WHEN** persisted telemetry or queue state has an incompatible version
- **THEN** the runtime reports a clear fresh-development-state diagnostic without deleting state or silently interpreting the legacy format

### Requirement: Indexed execution detail

Request, trace, origin and span lookups SHALL use indexes in all supported storage modes. The existing request-detail URL SHALL return RequestExecutionDetail with current request metadata, server-rooted spans/events, linked continuations, associated records, counts and incomplete/truncated reasons. Assembly SHALL coalesce requests by request ID and spans by composite identity, preferring completion then latest revision, and bound detail to 2000 records, 100 continuation traces and depth 64.

#### Scenario: Late continuation and reconnect

- **WHEN** a worker starts after HTTP completion or an Inspector reconnects
- **THEN** indexed current state includes the new linked trace without duplicate lifecycle entries and handles missing parents/cycles explicitly

#### Scenario: Exporter is slow

- **WHEN** execution is queried or a request completes while exports are pending
- **THEN** query visibility waits only for local persistence and request completion performs no record scan

### Requirement: Conforming isolated OTLP export

OTLP/HTTP JSON SHALL export self-contained completed spans and correlated logs with valid hexadecimal IDs, numeric enums, nanosecond timestamps, attributes, events, links and resource identities. Intermediate updates and domain-summary duplicate spans SHALL NOT be exported. Bounded queues, shutdown deadlines and isolated sink failures SHALL preserve application outcomes and prevent unhandled rejections.

#### Scenario: Collector tail sampling is configured

- **WHEN** complete failed traces are needed by Collector tail sampling
- **THEN** documentation specifies traceRate 1 without an in-process tail buffer or error-only override

#### Scenario: Sensitive application values are used

- **WHEN** operations receive SQL values, keys, prompts, credentials, payloads or dynamic request URLs
- **THEN** automatic telemetry captures none of those values unless explicit bounded development-redacted capture is enabled, query strings and raw dynamic paths remain excluded, and every sink receives redacted records

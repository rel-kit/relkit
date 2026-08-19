## Purpose

Defines correlated, bounded, queryable, and secret-safe runtime records for requests, invocations, managed operations, logs, traces, diagnostics, and live development updates.

## ADDED Requirements

### Requirement: Complete correlated runtime signals

The observability capability SHALL record request lifecycles, function invocations, job attempts, event publications/deliveries, bucket/cache operations, tool calls, agent model turns, structured logs, spans/traces, diagnostics, and generation lifecycle events with shared correlation identifiers.

#### Scenario: HTTP flow causes child work

- **WHEN** a request invokes a function that accesses cache, publishes an event, and enqueues a job
- **THEN** request, invocation, operations, logs, and spans share the correct request/trace/invocation relationships

### Requirement: Stable request record and timeline

Each completed accepted HTTP request SHALL produce a versioned record containing request, trace, generation, graph hash, route/function, timing/size, status, invocation, and one of success, declared-error, validation-error, timeout, cancelled, or defect outcomes, plus an ordered detail timeline.

#### Scenario: Declared route failure completes

- **WHEN** a target returns a declared error
- **THEN** the request record contains the configured status, `declared-error` outcome, safe error ID, and correlated trace timeline

### Requirement: Redaction precedes every sink

Secrets and configured sensitive fields SHALL be redacted before a record enters in-memory retention, terminal output, production JSON, local files, query APIs, SSE, inspector HTML, or browser responses.

#### Scenario: Synthetic secrets cross all flows

- **WHEN** request, function, event, job, bucket/cache, and agent flows contain the synthetic password, bearer token, cookie, and API key used by security tests
- **THEN** recursive scans of every observable sink find none of the raw secret values

### Requirement: Conservative capture defaults

Request/response bodies, authorization headers, cookies, binary data, environment secrets, and agent prompt/result content SHALL NOT be captured by default; development body capture SHALL require explicit redacted mode, bounded byte size, and configured key redaction.

#### Scenario: Default request contains credentials

- **WHEN** an HTTP request carries authorization, cookie, and JSON body fields
- **THEN** its metadata can be recorded but protected headers/cookies and body content are absent

#### Scenario: Redacted development capture is enabled

- **WHEN** a development configuration enables capture with a byte limit and redaction keys
- **THEN** captured content is truncated to the limit and sensitive keys are removed before storage

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

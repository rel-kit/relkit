## MODIFIED Requirements

### Requirement: Stable request record and timeline

Requests SHALL use version 2 start and authoritative completion records. Terminal timestamps, status, route, function and invocation references SHALL remain absent until known. The request lifecycle SHALL be derived from canonical spans and timestamped events, not a persisted request timeline.

#### Scenario: Declared route failure completes

- **WHEN** a target returns a declared error
- **THEN** completion contains the configured status, declared-error outcome, safe error identity, and correlated spans/events preserving all previously executed steps

#### Scenario: Request is still running

- **WHEN** HTTP handling starts but has not produced a response
- **THEN** its request and active server span are queryable without fabricated terminal fields

### Requirement: Inspector persistence precedes external sampling

Every admitted record SHALL be redacted before bounded local persistence and streaming. External sampling SHALL be deterministic per trace and apply consistently to its spans, logs and errors; errors SHALL NOT force partial trace exports. Unassociated diagnostics SHALL remain independently exportable.

#### Scenario: Trace is excluded from external export

- **WHEN** trace-level sampling excludes a trace, including one containing an error
- **THEN** its retained local execution remains queryable but no associated span or log is exported

## ADDED Requirements

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
- **THEN** automatic telemetry captures none of those values, query strings or raw dynamic paths, and every sink receives redacted records

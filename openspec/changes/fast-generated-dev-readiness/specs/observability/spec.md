## MODIFIED Requirements

### Requirement: Inspector persistence precedes external sampling

Every admitted record SHALL be redacted before bounded local retention, persistence, and streaming. During development persistence initialization, records SHALL enter bounded early retention and transfer into the canonical store in order without duplication or a handoff gap. External sampling SHALL be deterministic per trace and apply consistently to its spans, logs and errors; errors SHALL NOT force partial trace exports. Unassociated diagnostics SHALL remain independently exportable. Any early loss SHALL be explicit and SHALL not be attributed to export sampling.

#### Scenario: Trace is excluded from external export

- **WHEN** trace-level sampling excludes a trace, including one containing an error
- **THEN** its retained local execution remains queryable but no associated span or log is exported

#### Scenario: Records arrive while persistence starts

- **WHEN** startup and first-request events arrive before persistence initialization completes
- **THEN** redacted records are retained within bounds and transferred once in sequence while newer records continue arriving

#### Scenario: Startup records are dropped

- **WHEN** bounded early retention cannot retain every record
- **THEN** safe loss counts and incomplete-history status distinguish those records from records skipped only by external sampling

## ADDED Requirements

### Requirement: Early development retention is bounded and secret-safe

Development SHALL provide early retention before persistent telemetry is ready, bounded by both record count and bytes with declared defaults and bounded configuration. Redaction SHALL precede admission to memory and every subsequent sink. Overflow SHALL follow a deterministic eviction policy, maintain loss counters independently of the data queue, and emit a coalesced explicit diagnostic to available terminal, query, and eventual persistence sinks. Support initialization delays SHALL not block backend route execution.

#### Scenario: Persistence is delayed past first traffic

- **WHEN** application traffic completes while persistence is still initializing
- **THEN** bounded safe request/span/log/generation records remain available with explicit buffered status and the route response does not wait for storage

#### Scenario: Early buffer overflows

- **WHEN** record count or bytes exceeds its bound
- **THEN** memory remains bounded, documented oldest-record eviction applies, and an explicit overflow diagnostic retains dropped-record/byte counts even when the data queue is full

#### Scenario: Synthetic secrets enter early events

- **WHEN** startup or first-request events contain configured sensitive values
- **THEN** recursive scans of the early buffer, terminal, persisted output, query APIs, and SSE find no raw synthetic secrets

### Requirement: Asynchronous persistence exposes honest availability

Persistence initialization SHALL have a declared finite deadline and bounded recovery behavior. A failure SHALL retain bounded redacted observation and publish unavailable/incomplete status without failing healthy application work. Queries during startup SHALL distinguish current buffered records from durable history; startup repair SHALL preserve valid existing records. Transition to persistent storage SHALL preserve record identity, order, and cursor semantics without duplicate replay or recursive diagnostic amplification.

#### Scenario: Store initialization fails

- **WHEN** persistent storage fails or exceeds its initialization deadline
- **THEN** the backend continues serving, telemetry status identifies the failure safely, bounded buffering continues, and retries cannot grow resources indefinitely

#### Scenario: Store recovers during active traffic

- **WHEN** persistence becomes available while records and live subscriptions continue
- **THEN** retained records are handed off exactly once, queries retain their record identities, and stream cursors do not create duplicate events or omit retained events

#### Scenario: Existing store needs repair

- **WHEN** delayed startup finds a truncated final segment
- **THEN** existing bounded repair/quarantine preserves complete prior records and does not block application serving

### Requirement: Support shutdown and failures are bounded

Development shutdown SHALL flush early and persistent telemetry within a declared finite deadline while finalizing owned support workers and preserving the application drain contract. Exhausted flush or support failure SHALL report safe counters and incomplete history. Exporter or inspector failure SHALL not fail application work or substitute a telemetry error for an original typed failure, defect, or interruption.

#### Scenario: Shutdown occurs before persistence is ready

- **WHEN** development is cancelled with retained early records
- **THEN** owned workers finish or are interrupted within the cleanup bound, flush is bounded, and unpersisted loss is disclosed without an indefinite wait

#### Scenario: Support observation throws while startup fails

- **WHEN** an observer fails during an application startup failure or cancellation
- **THEN** the original application outcome remains observable and support cleanup still completes

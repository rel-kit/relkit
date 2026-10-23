## MODIFIED Requirements

### Requirement: Bounded repairable local storage

Inspector-owned local history SHALL preserve the existing project observability.duckdb data, use bounded retention and indexed queries, and evolve schemas non-destructively with storage versioning independent of bridge protocol. Startup repair/quarantine SHALL retain valid history. Competing writers SHALL report conflict without deleting the database.

#### Scenario: Final segment is truncated

- **WHEN** startup finds damaged or incomplete persisted diagnostic data after a crash
- **THEN** it reports or safely repairs/quarantines the damaged portion while preserving valid prior records and never deletes history to clear a lock

#### Scenario: Retention bound is exceeded

- **WHEN** age or byte limits are exceeded
- **THEN** the oldest eligible diagnostic records and index entries are removed without unbounded memory growth

### Requirement: Inspector persistence precedes external sampling

Every admitted record SHALL be redacted before bounded retention, transport and persistence. External sampling SHALL be deterministic per trace across spans/logs/errors, without error-forced partial exports; unassociated diagnostics SHALL remain independently exportable. When the independent inspector connects, retained records SHALL transfer in order with durable replay identity. Absent or failed persistence SHALL disclose incomplete history and SHALL NOT block business work.

#### Scenario: Trace is excluded from external export

- **WHEN** trace-level sampling excludes a trace, including one containing an error
- **THEN** its retained execution remains queryable when the corresponding buffer or inspector history is available but no associated span or log is exported

#### Scenario: Records arrive while persistence starts

- **WHEN** startup and first-request events arrive before persistence initialization completes
- **THEN** redacted records are retained within bounds and transferred in sequence with deduplicated committed envelopes while newer records continue arriving

#### Scenario: Startup records are dropped

- **WHEN** bounded early retention cannot retain every record
- **THEN** safe loss counts and incomplete-history status distinguish those records from records skipped only by external sampling

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

#### Scenario: No inspector tool connects
- **WHEN** records arrive before or without an inspector connection
- **THEN** retention defaults to 2,048 records and 2,097,152 encoded bytes, configurable only up to 65,536 records and 67,108,864 bytes; overflow evicts oldest records deterministically with independent loss counters

### Requirement: Asynchronous persistence exposes honest availability

Inspector-owned persistence initialization SHALL have a declared finite deadline and bounded recovery behavior. A failure SHALL retain bounded redacted observation and publish unavailable/incomplete status without failing healthy application work. Queries during startup SHALL distinguish current buffered records from durable history; startup repair SHALL preserve valid existing records. Transition to persistent storage SHALL preserve record identity, order, and cursor semantics without duplicate replay or recursive diagnostic amplification.

#### Scenario: Store initialization fails

- **WHEN** persistent storage fails or exceeds its initialization deadline
- **THEN** the backend continues serving, telemetry status identifies the failure safely, bounded buffering continues, and retries cannot grow resources indefinitely

#### Scenario: Store recovers during active traffic

- **WHEN** persistence becomes available while records and live subscriptions continue
- **THEN** retained records are handed off exactly once, queries retain their record identities, and stream cursors do not create duplicate events or omit retained events

#### Scenario: Existing store needs repair

- **WHEN** delayed startup finds damaged existing history
- **THEN** non-destructive bounded repair/quarantine preserves complete prior records and does not block application serving

### Requirement: Support shutdown and failures are bounded

Development shutdown SHALL flush early and persistent telemetry within a five-second support flush deadline while finalizing owned support workers and preserving the application drain contract. Exhausted flush or support failure SHALL report safe counters and incomplete history. Exporter or inspector failure SHALL not fail application work or substitute a telemetry error for an original typed failure, defect, or interruption.

#### Scenario: Shutdown occurs before persistence is ready

- **WHEN** development is cancelled with retained early records
- **THEN** owned workers finish or are interrupted within the cleanup bound, flush is bounded, and unpersisted loss is disclosed without an indefinite wait

#### Scenario: Support observation throws while startup fails

- **WHEN** an observer fails during an application startup failure or cancellation
- **THEN** the original application outcome remains observable and support cleanup still completes

## ADDED Requirements

### Requirement: Application observability has no local database ownership
Lightweight observability SHALL provide redacted records, logging and bounded retention/streaming contracts without DuckDB, driver or storage-worker dependencies. Stage 1 legacy CLI inspection SHALL acquire an explicit local store; Stage 2 SHALL give the standalone inspector sole history writes, queries, retention and storage workers.

#### Scenario: Console logging runs without inspector
- **WHEN** an application imports observability or starts production without local storage installed
- **THEN** logging works and imports, declarations and production artifacts contain no DuckDB or history worker

### Requirement: Collection queues have enforced byte and record bounds
Collection SHALL enforce encoded-record, batch, pending-queue, subscriber and aggregate backlog limits, including envelope accounting. Overflow SHALL deterministically evict/reject or disconnect slow subscribers, expose independent loss counters and coalesced diagnostics, and never block application requests.

#### Scenario: Collector or subscriber falls behind
- **WHEN** records exceed queue capacity
- **THEN** each record is at most 1 MiB, batches at most 256 records/1 MiB, pending persistence at most 2,048 records/4 MiB, subscribers default to 64 and at most 256 records/1 MiB each, aggregate subscriber backlog is at most 4 MiB, and batching uses 100 ms

#### Scenario: Flush exceeds its deadline
- **WHEN** support cannot flush within five seconds
- **THEN** cleanup completes within its bound and reports unflushed loss/incomplete history without replacing the application outcome

### Requirement: Durable collection acknowledges committed envelope identity
Records SHALL carry session plus monotonic sequence identity and generation attribution. Persistence SHALL commit data and replay identity before advancing durable acknowledgement. Entity identity SHALL NOT substitute for envelope identity; legitimate request/span revisions SHALL remain distinct updates.

#### Scenario: Commit succeeds but acknowledgement is lost
- **WHEN** the sender replays the same committed session/sequence envelope
- **THEN** persistence deduplicates it and acknowledges the existing commit without duplicate data

#### Scenario: A span receives a later revision
- **WHEN** the same span identity receives another revision with a new sequence
- **THEN** it is persisted as a legitimate update and current detail prefers authoritative completion/latest revision

#### Scenario: Disconnect precedes commit
- **WHEN** a write fails or the connection drops before commit
- **THEN** no durable acknowledgement advances and retained uncommitted envelopes can replay

#### Scenario: Cursor is older than retention
- **WHEN** requested replay has been evicted
- **THEN** the stream reports an explicit gap and resumes available data without claiming complete history

### Requirement: Collection receivers validate redacted wire records
Redaction SHALL precede retention/transport, and receiving collectors SHALL validate decoded record schemas and safe capture rules. An in-process admission brand SHALL NOT establish trust after JSON serialization.

#### Scenario: Malformed or unsafe wire record arrives
- **WHEN** a collector receives invalid fields, forbidden raw values or an oversized encoded envelope
- **THEN** it rejects the record safely before persistence and exposes bounded diagnostics without leaking the rejected content

### Requirement: History availability cannot alter durable business outcomes
Tool absence, slow consumers, disk-full, corruption, permission errors and worker crashes SHALL use bounded failure recovery without stopping requests or tasks. Diagnostic history SHALL remain separate from jobs, checkpoints, retries, provider caches and business state.

#### Scenario: Store fails during application failure
- **WHEN** collection fails while business work succeeds, fails, defects or is interrupted
- **THEN** the original outcome remains authoritative and storage retries cannot grow resources indefinitely

### Requirement: History directories retain project identity
Local inspection SHALL default to the existing project history location. Docker SHALL use an explicit persistent history volume. Opening a history directory owned by another project SHALL fail instead of merging records.

#### Scenario: Writer conflict or foreign volume is found
- **WHEN** another writer owns the database or a mounted volume names another project
- **THEN** the tool reports the conflict without deleting data, resetting schemas or touching durable application state

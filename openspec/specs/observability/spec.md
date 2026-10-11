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

### Requirement: Task traces preserve detached causation and bounded metrics

Task trigger SHALL emit an acceptance producer span and each task entry/attempt a fresh consumer trace linked to accepted causation. Task/job/version/build/service/run/attempt/correlation metadata SHALL be present in traces/logs; replay/resume SHALL not be mislabeled as retries. All sinks SHALL receive redacted data. Observation/native-store outages SHALL not rewrite task outcome or block accepted work. Metrics SHALL cover acceptance, queue age, state counts, durations, controls, throttling and watch resources without unbounded run/tenant labels.

#### Scenario: Request ends before task execution

- **WHEN** the producing HTTP invocation finishes days before the task resumes
- **THEN** task spans remain linked without keeping the request span or request signal alive

#### Scenario: High-cardinality workload

- **WHEN** many unique run IDs and scopes are processed
- **THEN** per-run identifiers remain in traces/logs and metric label cardinality stays bounded

### Requirement: Compiler operation telemetry is complete and bounded

Independently callable compiler domain operations SHALL record execution count, outcome, monotonic duration, and applicable workload counts in the caller's telemetry context, whether invoked directly or within a larger compilation. Outcomes SHALL distinguish success, expected failure, unexpected defect, and interruption. Operation, stage, outcome, and workload labels SHALL come from bounded declaration-owned sets; raw paths, descriptor identities, candidate content, credentials, and environment values SHALL NOT become metric labels or automatically captured log content.

#### Scenario: An operation is called independently

- **WHEN** a caller executes a package resolution, source analysis, normalization, planning, generation, or publication operation without an enclosing compiler stage
- **THEN** that operation records its own execution, terminal outcome, duration, and applicable workload counts

#### Scenario: Nested operations and a compatibility adapter execute

- **WHEN** a composed workflow executes distinct child operations through an existing compatibility adapter
- **THEN** each owning operation is counted once under its own bounded label and the adapter does not increment those counts again

#### Scenario: The operation fails or is interrupted

- **WHEN** an operation returns a typed failure, produces a defect, or is interrupted
- **THEN** its terminal outcome and duration are recorded once while preserving the operation's failure or interruption semantics

#### Scenario: Construction has not been executed

- **WHEN** a caller constructs an instrumented operation but does not execute it
- **THEN** workload getters are not evaluated and execution, duration, and outcome metrics remain unchanged

### Requirement: Compiler telemetry respects evaluator output ownership

Compiler instrumentation SHALL preserve the evaluator's output protocol and candidate side-effect observations. Instrumentation running while native candidate-output hooks are owned SHALL avoid emitting into those captured streams. Logger and exporter provisioning SHALL remain at runtime boundaries rather than being installed by compiler domain operations.

#### Scenario: Candidate output hooks are active

- **WHEN** instrumented discovery operations run while a candidate owns native output interception
- **THEN** compiler telemetry does not appear as candidate stdout, stderr, or a direct-output side-effect diagnostic

#### Scenario: A caller supplies a telemetry sink

- **WHEN** the caller provisions a logger, tracer, or metric registry for compiler execution
- **THEN** compiler operation signals use that context without installing a competing sink or placing telemetry metadata in generated artifact bytes

### Requirement: Execution domain operation telemetry is standalone and bounded

Every independently callable execution domain operation SHALL emit its execution count, terminal outcome, monotonic duration, applicable workload counts, and meaningful structured logs through supplied telemetry context. Outcomes SHALL distinguish success, expected failure, defect and interruption. Metric dimensions SHALL use bounded domain/operation/outcome labels; payloads, secrets and dynamic identities SHALL NOT become automatic metric labels or log content. Compatibility adapters SHALL NOT duplicate owning-operation counts.

#### Scenario: Domain operation is called directly

- **WHEN** a caller executes a provider, engine, runtime or transport domain operation without an enclosing stage
- **THEN** the operation emits its own bounded telemetry through the caller's context

#### Scenario: Operation is constructed but not executed

- **WHEN** an instrumented operation is only constructed
- **THEN** workload getters, logs and metrics are not evaluated

#### Scenario: Observer fails

- **WHEN** telemetry observation fails
- **THEN** the original operation result, typed failure, defect or interruption is preserved

### Requirement: Child logging configuration is isolated

Owned child work SHALL inherit structured annotations and logger configuration. An operation-local minimum-level override SHALL affect that child workflow without changing its parent or siblings. Actual configured sinks SHALL receive redacted lifecycle, recovery and failure events at their enabled levels.

#### Scenario: Child changes its minimum level

- **WHEN** one child workflow overrides its minimum log level before forking
- **THEN** the child's output reflects that level while parent and sibling configuration remain unchanged

### Requirement: Core consumer and development support operations are independently observable

Independently callable domain operations in the client, Inspector API, development supervisor, and testing support SHALL emit execution counts, terminal outcomes, monotonic durations, applicable workload measurements, and meaningful structured logs through their owning runtime's telemetry context. Outcomes SHALL distinguish success, expected failure, unexpected defect, and interruption. Labels SHALL use bounded domain, operation, outcome, and workload sets. Compatibility adapters SHALL NOT duplicate the owning operation's measurements. Constructing an unexecuted operation SHALL NOT emit execution telemetry.

#### Scenario: Standalone operation uses supplied telemetry

- **WHEN** a consumer invokes a domain operation outside a larger framework workflow with a supplied logger, tracer, and metric registry
- **THEN** the operation emits its own correlated execution telemetry through those supplied facilities

#### Scenario: A compatibility adapter invokes an operation

- **WHEN** an existing Promise, iterator, HTTP, React, or synchronous adapter executes an owning domain operation
- **THEN** the operation is counted once and nested distinct operations retain their own bounded attribution

#### Scenario: Observation ends before its source work

- **WHEN** a stream consumer closes an iterator or a subscription is interrupted
- **THEN** observation telemetry completes once with the appropriate outcome after its owned cleanup, without reporting the independently owned underlying job or agent run as cancelled

#### Scenario: Execution fails or telemetry delivery fails

- **WHEN** a domain operation fails, defects, or is interrupted, including while a telemetry sink fails
- **THEN** telemetry preserves the original operation result or cause and does not turn an exhausted failure into success or replace it with a telemetry error

### Requirement: Core operation logs respect runtime configuration and privacy

Core consumer and development support operations SHALL emit important lifecycle and outcome events at enabled operational levels, recovery events at warning level, and unrecovered failures at the owning error boundary. Noisy details SHALL respect debug filtering. Runtime-owned sinks and minimum-level configuration SHALL remain authoritative. Child work SHALL inherit correlation and logging context; child-specific level overrides SHALL leave parent and sibling levels unchanged. Payloads, credentials, cookies, raw URLs, persisted client keys, and dynamic identities SHALL NOT become automatic metric dimensions or unredacted log content. Telemetry reads SHALL NOT recursively amplify their own live event stream or leak server-only dependencies into browser consumers.

#### Scenario: Runtime uses its normal log threshold

- **WHEN** a standalone operation completes or recovers under the application's configured non-debug logging threshold
- **THEN** relevant enabled lifecycle, outcome, and recovery records reach the actual configured sink with safe operation context

#### Scenario: Child workflow changes its threshold

- **WHEN** a child workflow overrides its logging threshold while a parent and sibling continue
- **THEN** only the child's filtering changes and inherited annotations remain available to all three workflows

#### Scenario: Inspector observes its own telemetry

- **WHEN** an Inspector telemetry query or live subscription emits operation diagnostics
- **THEN** the query and stream remain bounded without repeated self-generated updates causing recursive diagnostic traffic

#### Scenario: Sensitive input reaches a browser client operation

- **WHEN** a browser client operation uses authorization, tenant, session, or request input
- **THEN** its configured telemetry exposes only safe bounded metadata, preserves browser-compatible execution, and does not install a server logger or transport

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

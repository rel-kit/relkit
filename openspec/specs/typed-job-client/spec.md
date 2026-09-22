## Purpose

Defines typed job submission, authorized observation and controls, retained result projections, and one bounded connection lifecycle shared by imperative and React consumers.

## Requirements

### Requirement: TJ-022 Private typed generated clients

Generated job contracts MUST include only declared public operations/projections and infer task schema types.

#### Scenario: Private typed generated clients

- **WHEN** a job is private or omits an operation or field
- **THEN** generated types omit that selector/member/field and the server rejects a forged access

### Requirement: TJ-023 Explicit connection lifecycle

Watch controllers MUST support idle creation, connect, disconnect, reconnect, and permanent disposal.

#### Scenario: Explicit connection lifecycle

- **WHEN** a manually disconnected controller encounters a rerender, visibility or online event
- **THEN** it stays disconnected until explicit connect or a changed run selection; disposal is permanent

### Requirement: TJ-024 Observation is not cancellation

Aborting or disposing a watch MUST NOT cancel task execution.

#### Scenario: Observation is not cancellation

- **WHEN** every observer aborts or disconnects while a task is running
- **THEN** execution continues and its eventual native terminal state remains queryable

### Requirement: TJ-025 Reconnect convergence and gaps

A reconnect MUST resume supported history or emit a reset with authoritative state.

#### Scenario: Reconnect convergence and gaps

- **WHEN** a reconnect cursor is outside native retention
- **THEN** the client receives a reset and authoritative current state with an explicit gap

### Requirement: TJ-026 Terminal verification

Stream EOF MUST NOT be treated as task success without terminal evidence.

#### Scenario: Terminal verification

- **WHEN** an upstream watch ends before native terminal evidence is known
- **THEN** the observer reconciles or reconnects and does not report task success from EOF

### Requirement: TJ-027 Identity-scoped observation

Connection epochs and cache identity MUST prevent stale data crossing run or tenant changes.

#### Scenario: Identity-scoped observation

- **WHEN** a delayed response from an old tenant/run arrives after identity selection changed
- **THEN** the response is discarded and old sensitive cached values are cleared

### Requirement: TJ-028 Bounded observation resources

Controllers/adapters MUST bound buffers, reads, connections and listeners and release them after the last observer.

#### Scenario: Bounded observation resources

- **WHEN** watches are repeatedly created, connected and disposed
- **THEN** bounded sockets, timers, listeners, reads and buffers return to baseline after the last observer leaves

### Requirement: TJ-029 Distinct state/progress/content streams

Run state, progress metadata, and named output streams MUST have explicit separate types and continuity/retention semantics.

#### Scenario: Distinct state/progress/content streams

- **WHEN** a retried task emits a new generation of named text content
- **THEN** the client identifies the new attempt/generation and does not append it as uninterrupted old content

### Requirement: TJ-030 Trusted scope and projection

Job ownership MUST derive from verified server authorization and be enforced before pagination/serialization.

#### Scenario: Trusted scope and projection

- **WHEN** a browser forges another tenant tag, run locator or cursor
- **THEN** authorization fails before private payload serialization and tenant scope is applied before pagination

### Requirement: Generated procedure envelopes and selectors are stable

Client jobs SHALL use literal name-based nested properties and the exact trigger/input/options, runs.get/list/watch/cancel/retry/stream operations declared by policy. Browser options SHALL not select job bindings, services, CPU, retries or deadlines. A generated registry SHALL infer schema input/output, errors, progress, stream names and projection. Existing route selectors and agent/realtime handshakes SHALL coexist with jobs and detect public-contract changes.

#### Scenario: Dotted route ID coexists

- **WHEN** an existing dotted route selector and jobs.exportOrders.runs.get are generated
- **THEN** the route keeps its existing lookup meaning and jobs uses its explicit nested path

#### Scenario: Root collision

- **WHEN** an existing route claims the root jobs namespace
- **THEN** compilation reports a collision instead of overwriting it

### Requirement: Ownership and long-lived grants precede serialization

Jobs SHALL be private without explicit client policy. Policy SHALL require exactly one of public or authorize, an allowed operation set and safe projection. Trusted server scope SHALL be persisted natively on submission and checked against native ownership for every read/control. Public access SHALL use a dedicated server scope. Grants SHALL be checked on connect/reconnect and at expiry/revocation during feeds. Native signatures, cookie-write origin/CSRF checks, payload limits and server-side projection SHALL prevent forged clients or callbacks from accessing private state.

Authorization results SHALL be validated grants, not booleans. Malformed/expired grants, timeout after at most 10 seconds and caller abort SHALL deny access; late results SHALL not authorize work. A renewed grant changing scope SHALL end the old feed before new access. Trusted server/system and schedule ownership SHALL remain distinct from public scope and SHALL never derive from task input or a fabricated browser session.

#### Scenario: Grant expires on an open feed

- **WHEN** authorization expires while a socket remains open
- **THEN** the server renews authorization or stops delivery and sensitive client state is cleared

#### Scenario: Client supplies a tenant field

- **WHEN** a trigger input or tag names another tenant
- **THEN** ownership still derives from verified server scope

#### Scenario: Grant resolves after cancellation

- **WHEN** authorization resolves after the request aborts or its authorization deadline passes
- **THEN** no native submission, read or frame delivery is authorized by that stale result

#### Scenario: Scheduled run belongs to the system

- **WHEN** a public client requests a system-scoped static-schedule run
- **THEN** the ordinary ownership check denies cross-scope access even though the job has a public policy

### Requirement: Watch initialization and cleanup close races

A watch SHALL start idle; concurrent connect calls SHALL share setup; manual disconnect SHALL persist until explicit reconnect/run change. Snapshot/subscription reconciliation SHALL use native revisions/watermarks or authoritative rereads, and publish terminal state before ending. Abort/return/dispose SHALL release native readers, timers and subscriptions within a bounded cleanup deadline. Shared observers SHALL be keyed by complete application/environment/identity/job/run/projection/schema identity.

A connected controller SHALL own its observation lease independently of callback subscriptions. Callback unsubscription SHALL not disconnect another controller or an explicitly connected imperative controller. Refetch SHALL preserve manual-disconnect state and release temporary resources. A watch-only policy SHALL support initialization, refetch and terminal reconciliation without requiring a separately exposed get operation. Disconnect/dispose during setup SHALL settle all pending connect promises and discard late data.

#### Scenario: Native snapshot race

- **WHEN** completion happens between subscribing and reading the initial snapshot
- **THEN** reconciliation publishes authoritative completion without stale state replacing it

#### Scenario: Unresponsive native cleanup

- **WHEN** an SDK does not settle its close operation
- **THEN** local disposal still completes within the configured bound and reports a cleanup diagnostic

#### Scenario: Watch-only job is refetched while disconnected

- **WHEN** an authorized watch-only controller explicitly refetches after manual disconnect
- **THEN** it receives one authorized snapshot without requiring get permission or leaving a subscription open, and remains disconnected

#### Scenario: One shared view disconnects during setup

- **WHEN** one of two controllers sharing a feed disconnects while connect is pending
- **THEN** its pending connect settles, the other controller keeps its lease and later data cannot reconnect the disconnected view

### Requirement: Observation bounds and content generations are enforced

Server limits SHALL bound watch counts, reads, queued frames, frame/item bytes and content delivered; limits SHALL be published and stricter provider limits enforced. State snapshots may coalesce only with explicit gaps. Historical/content frames SHALL never be silently discarded. Sequence SHALL increase within a local epoch; only native resumable cursors SHALL claim retained continuity. Named streams SHALL carry distinct run/name/attempt/generation identity and close independently of run finality.

#### Scenario: Slow content consumer

- **WHEN** buffer or content byte limits are reached
- **THEN** the client gets a resumable gap/reset or typed overflow failure instead of silent truncation

#### Scenario: Polling-only provider

- **WHEN** native push is unavailable but official bounded reads exist
- **THEN** the watch exposes polling source and state continuity with serialized reads

### Requirement: React hooks reuse identity-scoped observation and mutation behavior

useJobTrigger SHALL return the normal mutation result and preserve input/key/operation identity on ambiguous writes, including structured RPC unknown errors. useJobRun SHALL reuse the imperative controller and expose run, connection, isStale, lastObservedAt, connectionError, connect, disconnect and refetch. Missing run/identity or disabled state SHALL prevent automatic connection. Strict Mode, identity changes and cleanup SHALL not leak feeds; server render SHALL not start subscriptions.

Pending metadata SHALL use the same operationId and request digest as the submitted RPC request. Unknown recovery SHALL repeat the identical operation only under certified native recovery within its retained window; unsupported/expired recovery SHALL remain unknown without automatic resubmission. Raw task input SHALL not be persisted to browser storage automatically. Reload recovery SHALL require matching caller-supplied input; storage failure SHALL retain in-memory ambiguity handling. Pending tracking SHALL be bounded and identity-scoped, preserve unrelated intents across run selection, and clear sensitive data on principal/session change. Hook names SHALL require their respective declared trigger/watch/cancel/retry operations.

#### Scenario: Structured unknown write

- **WHEN** the server returns RELKIT_JOB_SUBMISSION_UNKNOWN as an RPC error
- **THEN** pending state and original idempotency key remain available for explicit recovery

#### Scenario: Hydration or disabled hook

- **WHEN** a hook renders on the server or without a usable run/identity
- **THEN** it opens no live subscription and any prefetched snapshot stays identity-scoped

#### Scenario: Recovery after reload

- **WHEN** an unknown operation is recovered after reload
- **THEN** the same stored operation/key and matching re-supplied request are required within the certified window; otherwise it remains unknown and no replacement is silently submitted

#### Scenario: Selected run changes while another submission is unknown

- **WHEN** the user opens a different run in the same identity scope
- **THEN** view state changes without deleting the unrelated unknown submission's recovery metadata

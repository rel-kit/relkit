## Purpose

Defines distinct background task executables, deterministic job bindings, native run lifecycle guarantees, replay safety, and stable identity across retries and deployments.

## ADDED Requirements

### Requirement: TJ-001 Distinct task executable

Relkit MUST expose `defineTask` with task-owned execution policies and a task-only context. It MUST NOT model a task as a function alias.

#### Scenario: Distinct task executable

- **WHEN** an immediate function and a durable task are declared
- **THEN** only the task owns background policies and native sleep; a retryable task context has no sleep

### Requirement: TJ-002 Jobs target tasks

`defineJob` MUST accept only task references and MUST reject function targets and job-owned handlers.

#### Scenario: Jobs target tasks

- **WHEN** defineJob receives a function in task or any job-owned handler
- **THEN** type checking and JavaScript descriptor validation reject the declaration with its source

### Requirement: TJ-004 Direct/context trigger equivalence

Direct task/job triggering and declared context triggering MUST use the same submission pipeline.

#### Scenario: Direct/context trigger equivalence

- **WHEN** equivalent direct and declared context calls submit the same scoped idempotency key
- **THEN** both use the same validated native acceptance, identity and tracing path

### Requirement: TJ-005 Deterministic default binding

Unbound tasks with a unique valid canonical export MUST receive a visible implicit job; missing/invalid/ambiguous/colliding implicit names MUST require an explicit named job. Explicit bindings MUST resolve deterministically.

#### Scenario: Deterministic default binding

- **WHEN** two explicit jobs bind a task without a designated default
- **THEN** unqualified task.trigger fails and an explicit matching job selector succeeds

### Requirement: TJ-006 Side-effect-free definitions

Authoring imports MUST NOT initialize workers, SDKs, schedules, or Docker.

#### Scenario: Side-effect-free definitions

- **WHEN** task, job and adapter modules are imported during generation
- **THEN** no network, worker, timer, schedule or Docker resource is started

### Requirement: TJ-007 Durable acceptance and unknown outcome

A trigger acknowledgement MUST mean native durable acceptance; a lost ambiguous response MUST remain unknown.

#### Scenario: Durable acceptance and unknown outcome

- **WHEN** native acceptance succeeds but its response is lost
- **THEN** the caller receives RELKIT_JOB_SUBMISSION_UNKNOWN with the original operation/key and does not create a replacement run automatically

### Requirement: TJ-009 Human-readable durations

Public duration fields MUST use the documented Effect-style string subset and consistent validation.

#### Scenario: Human-readable durations

- **WHEN** "2 days", a negative duration, infinity or an unsupported unit reaches policy validation
- **THEN** "2 days" is a fixed 48-hour duration and invalid values fail before submission

### Requirement: TJ-010 Native durable sleep

Advertised sleep MUST persist through the native engine and retain stable wait identity.

#### Scenario: Native durable sleep

- **WHEN** a worker crashes after committing a keyed sleep
- **THEN** restart uses the same logical run, wait identity and persisted due time without starting another full wait

### Requirement: TJ-012 One retry owner

The declared retry budget MUST count total logical application attempts and MUST NOT multiply with hidden native/core loops.

#### Scenario: One retry owner

- **WHEN** a task fails before and after multiple sleeps
- **THEN** total logical application attempts stay within maxAttempts and replays do not multiply the budget

### Requirement: TJ-013 Replay-safe contract

Documentation and execution MUST NOT promise exactly-once external work or arbitrary local-variable preservation.

#### Scenario: Replay-safe contract

- **WHEN** a crash follows a successful business side effect but precedes native acknowledgement
- **THEN** replay is permitted and the idempotent fixture still records one business effect

### Requirement: TJ-014 Separate duration clocks

Active execution duration and total elapsed deadline MUST remain distinct.

#### Scenario: Separate duration clocks

- **WHEN** a task sleeps, retries and crosses its elapsed deadline
- **THEN** acknowledged sleep is excluded only from active attempt time, and the acceptance-based elapsed deadline is never reset

### Requirement: TJ-015 Enforced resources

Advertised CPU/memory allocations MUST match actual execution isolation and expose resolved native limits.

#### Scenario: Enforced resources

- **WHEN** a task requests an allocation the execution host cannot isolate
- **THEN** activation rejects the request rather than applying resource limits only to control-plane containers

### Requirement: TJ-016 Distributed concurrency

Advertised task concurrency MUST hold across replicas and active versions within its defined jobs-service scope.

#### Scenario: Distributed concurrency

- **WHEN** replicas and old/new task versions contend for the same service-scoped cap
- **THEN** aggregate occupied execution slots stay at or below the declared limit across job bindings

### Requirement: TJ-017 Cancellation request versus finality

Cancellation receipts MUST be separate from confirmed terminal state.

#### Scenario: Cancellation request versus finality

- **WHEN** successful completion races a cancellation request
- **THEN** one native terminal result wins; a requested receipt alone never marks the run cancelled

### Requirement: TJ-018 Manual retry creates a run

Operator retry MUST create a new logical run linked to its source and revalidate version/input/access.

#### Scenario: Manual retry creates a run

- **WHEN** an operator retries a terminal run whose original input has expired
- **THEN** the operation fails explicitly and does not guess input, change the original run or select a new version

### Requirement: TJ-019 Pinned execution versions

Accepted runs MUST remain attached to their original compatible immutable build.

#### Scenario: Pinned execution versions

- **WHEN** a new build activates while an old run sleeps
- **THEN** old work resumes its pinned build and new submissions use the activated build

### Requirement: TJ-020 Routable historical identities

Run references MUST survive application restart, key rotation, and compatible service reconfiguration without an in-memory ID map.

#### Scenario: Routable historical identities

- **WHEN** the API restarts or locator keys rotate while a historical run is retained
- **THEN** the run resolves through its original service generation and supported key ring without an in-memory ID map

### Requirement: TJ-031 Shared module integration

Tasks MUST reuse existing context, service, event, agent, graph, storage and tracing facilities without replacing their owners.

#### Scenario: Shared module integration

- **WHEN** a task invokes a declared agent or a function tool triggers a task
- **THEN** existing context, policy, trace, agent checkpoint and event owners remain intact and no durable join is created

### Requirement: TJ-040 No workflow scope creep

This revision MUST NOT add a public workflow descriptor, checkpoint DSL, durable join or mandatory signal inbox.

#### Scenario: No workflow scope creep

- **WHEN** the public exports, packages and generated reference are inspected
- **THEN** they introduce no workflow descriptor, public checkpoint/join/signal API or required job-state service

### Requirement: TJ-042 Multi-service isolation

Multiple bindings of the same native provider MUST NOT share mutable global credentials or task context.

#### Scenario: Multi-service isolation

- **WHEN** two applications/services use the same provider in one process
- **THEN** credentials, worker identities, callbacks, requests and watchers remain attached to their originating binding

### Requirement: Canonical task input and output are validated without replaying transforms

Task submission SHALL validate caller input and persist its canonical schema-hashed value. Native re-entry SHALL validate an identity-preserving canonical wire contract without rerunning input transforms. Unrepresentable transformed schemas SHALL require inputWire or fail compilation. Output SHALL be validated before successful native completion; contract-invalid output is terminal RELKIT_TASK_OUTPUT_INVALID. Only supported JSON and explicit top-level void encoding SHALL cross the boundary; unsupported objects, undefined members, dates, bigint, binary objects, cycles and streams SHALL fail safely.

#### Scenario: Transform survives retry

- **WHEN** a task transforms text to a number and then retries
- **THEN** the handler receives the same validated number each time and the business transform is not applied to that number

#### Scenario: False wire validator

- **WHEN** inputWire transforms or changes accepted canonical bytes
- **THEN** validation rejects it rather than trusting type compatibility

#### Scenario: Void versus expiry

- **WHEN** a completed task intentionally returns void
- **THEN** its available void result is distinguishable from expired or redacted output

#### Scenario: RPC validation and manual retry reuse canonical input

- **WHEN** caller text is transformed to a number through generated RPC and that terminal run is manually retried
- **THEN** initial admission transforms once, retry validates the retained number without transforming it again, and the new run has its own attempt budget/deadline without repeating the original initial delay

#### Scenario: Transformed output or progress is observed

- **WHEN** a successful handler or progress emitter supplies a schema input that transforms to another canonical type
- **THEN** handlers/emitters accept the schema input type, observers receive its validated output type, and repeated reads do not apply the transform again; an unrepresentable canonical validator fails before activation

#### Scenario: Stored input is selected

- **WHEN** a permitted client selects input for a transformed task
- **THEN** its generated type describes retained canonical input rather than the original caller input

### Requirement: Sleep identity, retry policy and clock conversion are exact

Durations SHALL use finite number-plus-unit strings from milliseconds through weeks, normalize to exact safe integer milliseconds, reject negative/compound/calendar/unsafe values, and distinguish fixed days/weeks from zoned recurrence. Sleep keys SHALL be stable, bounded and unique per occurrence across the run horizon; replay of a completed wait SHALL not repeat its duration. The default task is durable with maxAttempts 3, initialDelay 1 second, maxDelay 30 seconds, factor 2 and no jitter. Backoff SHALL cap initialDelay × factor^(attempt−1); full jitter, if supported, stays in [0, cap]. Retry-after hints SHALL delay no less than both policy and hint. Earliest-start conversion SHALL never wake early; unrepresentable hard limits SHALL be rejected.

Unsigned decimal duration tokens SHALL follow design §7.1. Zero SHALL be valid only for sleep/delay/retry delays, not execution limits, result timeout, retention, recurrence or service timeouts. Retry attempts SHALL be positive safe integers, factor finite and at least one, and initialDelay no greater than maxDelay. Instants SHALL validate real calendar dates and timezone; derived timestamps SHALL not overflow. Memory SHALL resolve to positive exact safe integer bytes. Keyed policies SHALL use required non-null canonical top-level string/finite-number fields with type-preserving identity encoding.

#### Scenario: Timer rounding

- **WHEN** a supported timer requires whole seconds and the requested delay is fractional
- **THEN** the effective delay rounds upward and is disclosed, while an incompatible hard maximum fails

#### Scenario: Repeated wait key changes duration

- **WHEN** a resumed execution supplies another duration for an existing key/version
- **THEN** the runtime reports a compatibility violation instead of silently restarting the wait

#### Scenario: Boundary values are supplied

- **WHEN** zero sleep, zero recurrence, fractional attempts, an invalid calendar date, unsafe decimal precision or an optional object-valued partition key is supplied
- **THEN** zero sleep completes after cancellation/deadline checks and all invalid policies fail before native work without clamping or guessing

### Requirement: Task hooks and progress receipts do not claim transactional completion

Task lifecycle hooks SHALL remain bounded observational callbacks with entry/replay metadata, no value transformation, no sleeps and no retry ownership. Hook failure SHALL be diagnosed separately without rerunning successful work. Progress emission SHALL validate its schema and acknowledge persisted, sent or dropped/unavailable delivery; durable progress SHALL await native persistence and reject when that persistence fails. Latest persisted progress SHALL not imply complete retained history.

#### Scenario: Hook fails after success

- **WHEN** onSuccess throws after local output validation
- **THEN** the hook error is logged separately and successful business work is not retried because of it

#### Scenario: Live progress delivery fails

- **WHEN** the handler's business effect succeeds but live progress transport is unavailable
- **THEN** the receipt records delivery failure without changing the business outcome

### Requirement: Acceptance and observer lifetimes are independent

Submission cancellation SHALL cancel waiting only; possible native acceptance SHALL remain an unknown outcome. Accepted execution SHALL use its own worker signal and acceptance-based deadlines. Result waiting SHALL require a finite readable timeout and abort signal support and SHALL be rejected under task execution ancestry with RELKIT_TASK_BLOCKING_WAIT_UNSUPPORTED, including indirect function calls.

#### Scenario: Indirect task join

- **WHEN** a task invokes a function that calls runs.result
- **THEN** the call fails with the blocking-wait error and no process-local durable join is introduced

#### Scenario: Submission abort after send

- **WHEN** a request aborts after work may have reached the provider
- **THEN** the response is ambiguous and accepted native work is not implicitly cancelled

### Requirement: Unknown statuses and terminal results preserve evidence

Only completed, failed, cancelled and timed-out SHALL be terminal. Unmapped native states SHALL be unknown with a safe diagnostic; read outages SHALL change observer health rather than known run state. Terminal output SHALL be immutable and unavailable/redacted/expired/version-incompatible results SHALL be explicit. Historical payloads SHALL never be decoded under an incompatible current schema.

#### Scenario: Late running update

- **WHEN** an older running snapshot arrives after confirmed completion
- **THEN** the client retains immutable terminal state

#### Scenario: Output schema changed

- **WHEN** a current client reads an incompatible old result
- **THEN** it receives version-incompatible availability rather than a falsely typed output

### Requirement: Logical idempotency survives representation changes

Run-scoped business keys SHALL remain unchanged across native event-to-run resolution, replay, public-name changes and locator-key rotation. Distinct typed key values SHALL remain distinct. The first accepted request SHALL retain its input/scope/build/scheduling under duplicate submission. Manual retry operation identity SHALL deduplicate to one new run rather than to the original submission.

#### Scenario: Locator key rotates during a wait

- **WHEN** a sleeping run resumes after locator signing-key rotation
- **THEN** its business-effect key remains unchanged and duplicate receipt recovery still identifies the original accepted run

#### Scenario: Retry response is lost

- **WHEN** an operator repeats the same authorized retry operation after an ambiguous acknowledgement
- **THEN** certified recovery returns the same new linked run, without modifying or deduplicating back to the original run

### Requirement: Declared task failures remain failures

Returned failure wrappers and returned/thrown declared errors SHALL be recognized before successful output validation and obey their declared retry metadata. Native suspension SHALL remain separate from both application failure and successful output, including synchronous throws and asynchronous rejections. Ordinary functions SHALL retain their existing handler-result behavior.

#### Scenario: Handler returns a declared nonretryable error

- **WHEN** a task returns a declared error or its failure wrapper
- **THEN** the run records that safe declared failure without treating it as output or retrying it as an unknown exception

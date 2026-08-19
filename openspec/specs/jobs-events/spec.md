## Purpose

Defines typed asynchronous jobs, schedules, versioned events, generic trigger listeners, and explicit ephemeral or durable delivery and recovery semantics.

## Requirements

### Requirement: Typed at-least-once jobs

A job SHALL declare typed input, a target function, retry policy, optional profile/timeout/concurrency/schedules/idempotency, and a Promise-based enqueue client; accepted durable jobs SHALL be persisted before acknowledgement and delivered at least once.

#### Scenario: Valid job is enqueued

- **WHEN** a declared function enqueues valid job input
- **THEN** the provider validates and durably accepts it, returns an instance ID and acceptance metadata, and eventually invokes the target through the common engine with source `job`

#### Scenario: Invalid job input is enqueued

- **WHEN** enqueue input violates the job schema
- **THEN** the request is rejected before a durable record or target invocation is created

### Requirement: Observable job state machine

Durable jobs SHALL move through accepted, available, leased, delayed, completed, or dead-lettered states according to handler result, retry policy, lease ownership, and administrative actions; recovery is an operation that returns eligible work to one of those states, not a separate state.

#### Scenario: Retryable attempt fails

- **WHEN** an attempt fails with retry classification and attempts remain
- **THEN** the job enters delayed state using the declared backoff/jitter policy and becomes available after deterministic clock advancement

#### Scenario: Attempts are exhausted

- **WHEN** a job reaches its maximum attempts without success
- **THEN** it enters dead-letter state with safe failure metadata visible to query/admin APIs

#### Scenario: Lease expires during recovery

- **WHEN** startup or the active clock detects an expired leased job
- **THEN** the job atomically returns to `available` without entering an invented recovered state or retaining two active owners

### Requirement: Lease and crash recovery

The durable job provider SHALL recover expired leases, accepted work, retry delays, dead-letter records, and idempotency records after process restart and SHALL quarantine malformed persistent records.

#### Scenario: Worker crashes after handler success before acknowledgement

- **WHEN** a process stops after target success but before durable acknowledgement
- **THEN** the lease eventually expires and redelivery may occur, proving documented at-least-once rather than exactly-once semantics

### Requirement: Job idempotency and concurrency

Declared idempotency keys and retention SHALL suppress duplicate accepted work only to the extent explicitly contracted, and effective job execution concurrency SHALL be the stricter of function and trigger/provider limits.

#### Scenario: Duplicate key is retained

- **WHEN** equivalent job input is enqueued again while its idempotency record is active
- **THEN** the provider applies the declared duplicate behavior and exposes acceptance metadata without claiming universal exactly-once execution

### Requirement: Deterministic schedules

Schedules SHALL validate cron expression, timezone, static input, and overlap policy at compile time, then enqueue or invoke through the job/function path using the runtime/test clock.

#### Scenario: Scheduled run overlaps

- **WHEN** a new fire occurs while the prior execution is active
- **THEN** the declared overlap policy deterministically skips or admits the run

#### Scenario: Cron is invalid

- **WHEN** a schedule has invalid syntax or missing required static input
- **THEN** compilation fails before runtime startup with a source-located diagnostic

### Requirement: Versioned event contracts and envelopes

An event SHALL have an explicit stable ID, integer version, validated payload, and optional sensitive-field metadata; publishing SHALL create a validated envelope with instance/event/version/time, key, attributes, correlation, causation invocation, and trace information.

#### Scenario: Event is published from a function

- **WHEN** a declared function publishes a valid event payload
- **THEN** the provider validates it, creates one correlated envelope, and returns acceptance metadata

#### Scenario: Event payload is invalid

- **WHEN** a payload violates the event schema
- **THEN** publication is rejected before any delivery is accepted

### Requirement: Compile-time event selector expansion

Single-event, `anyOf`, `match`, and restricted raw-all selectors SHALL compile into sorted known event ID/version pairs and a corresponding typed target-input contract; runtime providers SHALL route those explicit pairs rather than reinterpreting source patterns.

#### Scenario: Any-of selector expands

- **WHEN** a listener selects several known event descriptors
- **THEN** its target input is a discriminated union by `eventId` and `version`, and the graph stores the sorted expansion

#### Scenario: Raw all-event listener is used

- **WHEN** a listener opts into raw unknown payload capture for audit, telemetry, or development tooling
- **THEN** compilation emits the required volume/sensitive-data warning and rejects use outside the restricted policy

### Requirement: Independent event fan-out

One accepted event SHALL fan out to every matching event trigger independently, and one trigger's failure SHALL NOT revoke or roll back deliveries already accepted for other triggers.

#### Scenario: One of two listeners fails

- **WHEN** two durable listeners match an event and one target fails
- **THEN** the successful listener can complete while the failing listener follows its own retry/dead-letter policy

### Requirement: Explicit event delivery modes

Ephemeral listeners SHALL provide transient delivery with no restart-recovery claim, while durable listeners SHALL persist acceptance, use at-least-once leases/retries/dead-lettering, recover after restart, and allow duplicate delivery after an acknowledgement gap.

#### Scenario: Ephemeral provider restarts

- **WHEN** an ephemeral event has not completed delivery before process loss
- **THEN** the provider does not claim or synthesize recovery

#### Scenario: Durable provider restarts

- **WHEN** accepted durable delivery state exists across restart
- **THEN** pending or expired work is recovered and can be drained through the common function engine

### Requirement: Event ordering capability is honest

Providers SHALL expose whether per-key ordering is supported, and application-visible behavior and contract tests SHALL follow the declared capability without implying global ordering.

#### Scenario: Ordering is unsupported

- **WHEN** the provider reports no ordered-by-key capability
- **THEN** the runtime and inspector do not promise ordered delivery for equal event keys

### Requirement: Event listeners remain trigger concepts

Graph output, generated source, public exports, APIs, inspector terminology, and tests SHALL represent listeners as event triggers targeting functions and SHALL contain no separate subscription descriptor or graph resource.

#### Scenario: Full event fixture compiles

- **WHEN** events and `onEvent` bindings are compiled
- **THEN** the graph contains event nodes and generic trigger nodes only, and a source scan finds no generated `*.subscription.ts`

### Requirement: Deterministic async test controls

The testing harness SHALL let tests enqueue/run/drain jobs and publish/deliver events one item at a time, advance time explicitly, inspect state, inject named failure points, and restart against shared state without arbitrary sleeps.

#### Scenario: Retry delay is tested

- **WHEN** a test causes a retryable job or event failure
- **THEN** it observes delayed state, advances the deterministic clock by the required duration, and then runs the next attempt

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

Known event-name strings, `anyOf`, `match`, and restricted raw-all selectors SHALL compile from the generated event registry into sorted known event ID/version pairs and corresponding callback payload contracts; runtime providers SHALL route those explicit pairs rather than reinterpret source patterns.

#### Scenario: One event name is selected

- **WHEN** a listener names a known event string
- **THEN** its callback receives that event's payload type and the graph stores its exact ID/version pair

#### Scenario: Any-of selector expands

- **WHEN** a listener selects several known event names
- **THEN** its callback input can narrow a discriminated union by event ID/version and the graph stores the sorted expansion

#### Scenario: Raw all-event listener is used

- **WHEN** a listener opts into raw unknown payload capture for audit, telemetry, or development tooling
- **THEN** compilation emits the required volume/sensitive-data warning and rejects use outside the restricted policy

### Requirement: Independent event fan-out

One accepted event SHALL fan out to every matching event trigger independently, and one trigger's failure SHALL NOT revoke or roll back deliveries already accepted for other triggers.

#### Scenario: One of two listeners fails

- **WHEN** two durable listeners match an event and one target fails
- **THEN** the successful listener can complete while the failing listener follows its own retry/dead-letter policy

### Requirement: Explicit event delivery modes

Listeners SHALL default to durable at-least-once delivery with the current one-attempt retry policy unless configured otherwise; ephemeral listeners SHALL provide transient delivery with no restart-recovery claim, while durable listeners SHALL persist acceptance, use leases/retries/dead-lettering, recover after restart, and allow duplicate delivery after an acknowledgement gap.

#### Scenario: Delivery is omitted

- **WHEN** a listener does not declare `delivery`
- **THEN** compilation and runtime use durable delivery with one attempt unless a retry policy is supplied

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

Graph output, generated source, public exports, APIs, inspector terminology, and tests SHALL represent callback listeners as event triggers targeting generated internal functions and SHALL contain no separate subscription descriptor or graph resource.

#### Scenario: Full event fixture compiles

- **WHEN** events and callback `onEvent` bindings are compiled
- **THEN** the graph contains event nodes, generated function nodes, and generic trigger nodes only, and a source scan finds no generated `*.subscription.ts`

#### Scenario: One listener fails during fan-out

- **WHEN** independently lowered callback listeners receive the same event and one fails
- **THEN** each trigger retains independent retry/dead-letter state and other accepted deliveries are not revoked

### Requirement: Deterministic async test controls

The testing harness SHALL let tests enqueue/run/drain jobs and publish/deliver events one item at a time, advance time explicitly, inspect state, inject named failure points, and restart against shared state without arbitrary sleeps.

#### Scenario: Retry delay is tested

- **WHEN** a test causes a retryable job or event failure
- **THEN** it observes delayed state, advances the deterministic clock by the required duration, and then runs the next attempt

### Requirement: Typed callback listener context

An event callback SHALL receive the validated event payload followed by a framework-neutral context containing envelope identity, version, key, attributes, occurrence time, trace, correlation, causation, cancellation, logging, and only declared dependency clients.

#### Scenario: Callback receives an event

- **WHEN** a known event is delivered to a callback listener
- **THEN** its payload type matches the registered event and its context preserves the accepted envelope metadata

#### Scenario: Callback invokes a dependency

- **WHEN** a listener declares and calls another framework capability
- **THEN** that call is typed, correlated, and executed through the same engine/provider boundary as a normal function dependency

### Requirement: Declared-error retry hints constrain asynchronous delivery

Job attempts and durable event-listener deliveries SHALL combine their retry policy with a thrown declared error's normalized retry classification; omitted or `never` retry metadata SHALL make that declared application failure non-retryable, while `later` SHALL permit another policy-bounded attempt.

#### Scenario: Non-retryable declared error is thrown

- **WHEN** a job or durable event listener throws a declared error whose retry metadata is omitted or `never`
- **THEN** the delivery does not schedule another application attempt even when its general retry policy has attempts remaining

#### Scenario: Retryable declared error is thrown

- **WHEN** a job or durable event listener throws a declared error classified as `later` and attempts remain
- **THEN** the delivery enters its delayed state and follows its own retry/dead-letter lifecycle

### Requirement: Declared retry delay is a minimum hint

When a retryable declared error supplies `afterMs`, the next job or durable event-listener attempt SHALL be scheduled no sooner than both the policy-calculated delay and the error hint, subject to remaining attempts, cancellation, and the effective deadline.

#### Scenario: Error hint exceeds policy backoff

- **WHEN** policy backoff is 500 milliseconds and the declared error specifies `afterMs: 2000`
- **THEN** deterministic delivery remains delayed for at least 2000 milliseconds

#### Scenario: Policy backoff exceeds error hint

- **WHEN** policy backoff is 5000 milliseconds and the declared error specifies `afterMs: 1000`
- **THEN** deterministic delivery remains delayed for at least 5000 milliseconds

#### Scenario: Direct invocation receives retryable error

- **WHEN** the same retryable error is thrown from an ordinary direct function invocation
- **THEN** the engine returns the normalized failure without automatically repeating the invocation

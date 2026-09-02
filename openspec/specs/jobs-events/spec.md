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

An event SHALL have an explicit stable ID, an optional positive integer version defaulting to `1`, validated `input`, and optional sensitive-field metadata; publishing SHALL create a validated envelope with instance/event/version/time, key, attributes, correlation, causation invocation, and trace information.

#### Scenario: Event is published from a function

- **WHEN** a function declares the event ID in `publishes` and publishes valid input
- **THEN** the provider validates it, creates one correlated envelope, and returns acceptance metadata without waiting for consumers

#### Scenario: Event payload is invalid

- **WHEN** publication input violates the event schema
- **THEN** publication is rejected before any delivery is accepted

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

### Requirement: Deterministic async test controls

The testing harness SHALL let tests enqueue/run/drain jobs and publish/deliver events one item at a time, advance time explicitly, inspect state, inject named failure points, and restart against shared state without arbitrary sleeps.

#### Scenario: Retry delay is tested

- **WHEN** a test causes a retryable job or event failure
- **THEN** it observes delayed state, advances the deterministic clock by the required duration, and then runs the next attempt

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

### Requirement: Exact event functions consume independently

Each `defineEventFunction` SHALL bind one exact known event ID to one authored event-only function and one generated trigger; accepted events SHALL still fan out to zero, one, or many matching triggers whose acknowledgement, retry, replay, and dead-letter state remain independent.

#### Scenario: Two event functions receive one event

- **WHEN** two durable event functions name the same event and one handler fails
- **THEN** the successful delivery completes while the failed delivery follows only its own retry and dead-letter policy

### Requirement: Event function context preserves delivery metadata

An event function SHALL receive parsed event input and a context separating event identity, one-based delivery attempt/replay state, and trace/correlation/causation metadata while retaining ordinary declared managed capabilities.

#### Scenario: Retried delivery reaches a handler

- **WHEN** a durable delivery is retried
- **THEN** `context.trigger.delivery.attempt` increases, replay state is accurate, and the accepted envelope identity remains available

### Requirement: Job and event runtimes use provider bindings

Job and event execution SHALL resolve independent physical profiles through the common provider-binding and runtime-integration plans, construct only graph-required bindings, and isolate each binding's configuration, credentials, health, and lifecycle from every other capability.

#### Scenario: Connected queue and infrastructure event bus coexist

- **WHEN** jobs select a configured queue adapter and events select an infrastructure-owned event adapter
- **THEN** runtime wires each independently and deployment creates lifecycle operations only for the infrastructure-owned binding

#### Scenario: One async integration is unavailable

- **WHEN** an unused event profile lacks required values while the graph requires only jobs
- **THEN** job readiness is unaffected and the event runtime is not loaded

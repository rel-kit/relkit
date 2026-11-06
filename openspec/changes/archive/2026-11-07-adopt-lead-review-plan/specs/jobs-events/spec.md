# Spec Delta

## MODIFIED Requirements

### Requirement: Typed at-least-once jobs

New jobs SHALL bind tasks and infer their schemas; trigger SHALL acknowledge native durable acceptance
with a RunHandle before any task result is available. Function-target jobs, job-owned execution
policies and the legacy jobs entry point SHALL NOT exist.

#### Scenario: Valid job is enqueued

- **WHEN** application code triggers a task-backed job with valid input
- **THEN** the provider validates and durably accepts it, returns a run handle with acceptance
  metadata, and eventually runs the task through the common engine with source `job`

#### Scenario: Invalid job input is enqueued

- **WHEN** trigger input violates the task's input schema
- **THEN** the request is rejected before a durable record or task run is created

### Requirement: Observable job state machine

Task-backed runs SHALL normalize queued, delayed, running, sleeping, retrying, completed, failed,
cancelled, timed-out and unknown native states. Cancellation request metadata SHALL be distinct from
terminal cancellation, native evidence SHALL decide finality, and event delivery SHALL remain
unchanged.

#### Scenario: Retryable attempt fails

- **WHEN** a task run attempt fails with a retryable classification and attempts remain
- **THEN** the run enters the retrying or delayed state using the declared backoff policy and becomes
  runnable after deterministic clock advancement

#### Scenario: Attempts are exhausted

- **WHEN** a task run reaches its maximum attempts without success
- **THEN** it ends failed, or dead-lettered on backends that support it, with safe failure metadata
  visible to query and admin APIs

#### Scenario: Lease expires during recovery

- **WHEN** startup or the active clock detects an expired lease on a running task run
- **THEN** the run returns to a runnable state without an invented recovered state or two active
  owners

### Requirement: Lease and crash recovery

Task-backed providers SHALL recover accepted, queued, delayed, sleeping and retrying work through
native persistence and fencing with the stated durability window and no memory fallback, SHALL
quarantine malformed records, and SHALL document at-least-once effects.

#### Scenario: Worker crashes after handler success before acknowledgement

- **WHEN** a worker stops after a task succeeds but before durable acknowledgement
- **THEN** the lease eventually expires and redelivery may occur, proving documented at-least-once
  rather than exactly-once semantics

### Requirement: Job idempotency and concurrency

Idempotency SHALL suppress duplicates only within its documented native scope and retention.
Concurrency SHALL be task-owned and distributed across application, environment, jobs service, task
and optional canonical key, including replicas, bindings and versions. Trusted scope and stable job
identity SHALL namespace duplicate submission; original receipt recovery SHALL be explicitly supported
or refused.

#### Scenario: Duplicate key is retained

- **WHEN** equivalent job input is enqueued again while its idempotency record is active
- **THEN** the provider applies the declared duplicate behavior and exposes acceptance metadata
  without claiming universal exactly-once execution

### Requirement: Deterministic schedules

Task-backed schedules SHALL validate five-field cron with explicit IANA timezone or an exclusive
positive readable interval, canonical static input and supported overlap/misfire policy before
activation. Native recurrence SHALL own durable ticking and publish its actual downtime/DST/overlap
behavior.

#### Scenario: Scheduled run overlaps

- **WHEN** a schedule fires while the previous run of that schedule is still active
- **THEN** the declared overlap policy deterministically skips or admits the run

#### Scenario: Cron is invalid

- **WHEN** a schedule has invalid syntax or missing required static input
- **THEN** compilation fails before runtime startup with a source-located diagnostic

## ADDED Requirements

### Requirement: Schedules fire once per occurrence across instances

Each schedule occurrence SHALL enqueue exactly one run however many application instances are
running, and each scheduled run SHALL carry its occurrence time as part of its identity.

#### Scenario: Two instances share a durable backend

- **WHEN** two instances run the built-in scheduler against the same durable backend
- **THEN** one run is enqueued per occurrence

### Requirement: Delivery guarantees are documented

The docs SHALL state that durable jobs and events are delivered at least once, that recovered runs
execute again, and how to make handlers idempotent with keys.

#### Scenario: Developer reads the jobs guide

- **WHEN** a developer opens the jobs guide
- **THEN** it explains at-least-once delivery, re-runs after recovery and idempotency keys, with an
  example

## ADDED Requirements

### Requirement: TJ-034 Native scheduling only

Schedules MUST use native durable recurrence and publish their actual overlap/misfire policy.

#### Scenario: Native scheduling only

- **WHEN** a native scheduler recovers after downtime spanning multiple ticks
- **THEN** recovery follows the published native overlap/misfire policy without a hidden process-local cron fallback

### Requirement: Native schedule reconciliation preserves ownership and accepted builds

Schedules SHALL be stably scoped to application/environment/service/job/schedule, reconciled idempotently only after the target build is ready, and preserve unrelated or operator-owned dynamic schedules. Rollout SHALL atomically switch or pin future ticks through supported native APIs without moving accepted runs. Delay SHALL start at acceptance, absolute at SHALL require timezone and be exclusive with delay, and scheduledFor SHALL preserve the intended instant even if execution starts late.

Removing a static declaration SHALL remove only its previously owned native schedule. Deployment SHALL preserve operator pauses, including target/input updates, until explicit authorized resume. Static input SHALL be canonicalized with executable validation at compilation and dynamic input at upsert; ticks SHALL reuse its pinned canonical schema/input, fresh run identity and persisted trusted scope without replaying transforms/defaults or constructing a browser session. Ambiguous reconciliation SHALL not be reported as successful activation.

#### Scenario: Reconcile acknowledgement lost

- **WHEN** native creation succeeds but its deployment response is lost
- **THEN** reconciliation retries the same ownership identity without duplicate schedules or ticks

#### Scenario: Static and dynamic ownership collide

- **WHEN** a deployment declares a schedule ID already owned by an operator
- **THEN** it reports conflict instead of overwriting or deleting operator state

#### Scenario: Past absolute submission

- **WHEN** at is in the past and admission uses the default
- **THEN** work becomes eligible now and recorded scheduling intent is preserved

#### Scenario: Paused schedule survives deployment

- **WHEN** an operator pauses a static schedule and a deployment updates its task build
- **THEN** the schedule remains paused with the compatible target until explicitly resumed

#### Scenario: Static schedule is removed

- **WHEN** a previously deployed static declaration is removed
- **THEN** its owned recurrence is deleted idempotently while operator-created schedules remain untouched

#### Scenario: Schedule input has a transform

- **WHEN** a scheduled input is transformed during declaration validation or authorized upsert
- **THEN** every tick validates the same canonical value without rerunning the caller transform and retains its trusted native ownership scope

#### Scenario: Consecutive ticks have identical input

- **WHEN** two schedule slots use identical input with a payload-derived admission key, and one slot is delivered twice
- **THEN** native occurrence identity produces one run per slot, recovers the duplicate slot's original run and does not suppress the next slot using the trigger admission key

## MODIFIED Requirements

### Requirement: Typed at-least-once jobs

New jobs SHALL bind tasks and infer their schemas; trigger SHALL acknowledge native durable acceptance with a RunHandle before any task result is available. Legacy function-target jobs SHALL remain available only through the deprecated legacy entry point with compatibility.legacyJobs enabled for one release, retaining their input/retry/profile policy and unchanged enqueue result. New APIs SHALL reject function targets and job-owned execution policies.

#### Scenario: Valid job is enqueued

- **WHEN** an opted-in legacy function enqueues valid legacy job input
- **THEN** the provider validates and durably accepts it, returns an instance ID and acceptance metadata, and eventually invokes the target through the common engine with source `job`

#### Scenario: Invalid job input is enqueued

- **WHEN** legacy enqueue input violates the legacy job schema
- **THEN** the request is rejected before a durable record or target invocation is created

### Requirement: Observable job state machine

Task-backed runs SHALL normalize queued, delayed, running, sleeping, retrying, completed, failed, cancelled, timed-out and unknown native states. Cancellation request metadata SHALL be distinct from terminal cancellation, and native evidence SHALL decide finality. Legacy jobs SHALL retain accepted, available, leased, delayed, completed and dead-lettered states and their lease recovery semantics; event delivery SHALL remain unchanged.

#### Scenario: Retryable attempt fails

- **WHEN** a legacy job attempt fails with retry classification and attempts remain
- **THEN** the job enters delayed state using the declared backoff/jitter policy and becomes available after deterministic clock advancement

#### Scenario: Attempts are exhausted

- **WHEN** a legacy job reaches its maximum attempts without success
- **THEN** it enters dead-letter state with safe failure metadata visible to query/admin APIs

#### Scenario: Lease expires during recovery

- **WHEN** startup or the active clock detects an expired leased legacy job
- **THEN** the job atomically returns to `available` without entering an invented recovered state or retaining two active owners

### Requirement: Lease and crash recovery

Legacy durable providers SHALL continue recovering leases, accepted work, retry delays, dead letters and idempotency records and quarantining malformed records. Task-backed providers SHALL recover accepted, queued, delayed, sleeping and retrying work through native persistence/fencing with the stated durability window and no memory fallback. Both models SHALL document at-least-once effects.

#### Scenario: Worker crashes after handler success before acknowledgement

- **WHEN** a legacy job process stops after target success but before durable acknowledgement
- **THEN** the lease eventually expires and redelivery may occur, proving documented at-least-once rather than exactly-once semantics

### Requirement: Job idempotency and concurrency

Idempotency SHALL suppress duplicates only within its documented native scope and retention. Legacy effective concurrency SHALL remain the stricter function/trigger/provider limit. Task-backed concurrency SHALL be task-owned and distributed across application/environment/jobs-service/task/optional canonical key, including replicas, bindings and versions. Trusted scope and stable job identity SHALL namespace duplicate submission; original receipt recovery SHALL be explicitly supported or refused.

#### Scenario: Duplicate key is retained

- **WHEN** equivalent job input is enqueued again while its idempotency record is active
- **THEN** the provider applies the declared duplicate behavior and exposes acceptance metadata without claiming universal exactly-once execution

### Requirement: Deterministic schedules

New task-backed schedules SHALL validate five-field cron with explicit IANA timezone or an exclusive positive readable interval, canonical static input and supported overlap/misfire policy before activation. Native recurrence SHALL own durable ticking and publish its actual downtime/DST/overlap behavior. Existing legacy schedules SHALL retain their runtime/test-clock job/function path under explicit legacy mode.

#### Scenario: Scheduled run overlaps

- **WHEN** a legacy schedule fire occurs while the prior execution is active
- **THEN** the declared overlap policy deterministically skips or admits the run

#### Scenario: Cron is invalid

- **WHEN** a schedule has invalid syntax or missing required static input
- **THEN** compilation fails before runtime startup with a source-located diagnostic

## ADDED Requirements

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


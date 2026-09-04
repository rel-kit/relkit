## ADDED Requirements

### Requirement: Durable causal propagation

Event publications and job enqueues SHALL have producer spans covering validation and provider acceptance, with propagation created inside the producer and stored separately from payloads. Local, AWS, generated and test transports SHALL preserve it across queue transitions, restart, retries, replay and administrative retry. Idempotent duplicate enqueue SHALL preserve original causation.

#### Scenario: Worker retries after restart

- **WHEN** a durable item restarts and retries
- **THEN** its stable event/job identity and origin remain, while each attempt receives fresh trace/span/invocation IDs linked to the original producer

### Requirement: Detached consumer lifecycle

Each delivery/attempt SHALL start a fresh consumer trace linked to its producer, never a synchronous-delivery special case. Durable work SHALL NOT inherit request signal or deadline. Recording SHALL cover acknowledgement only where the adapter owns it, otherwise identify handler-only observation. Scheduled work SHALL start fresh without request identity.

#### Scenario: Request terminates before fan-out

- **WHEN** the HTTP response completes or cancels before event fan-out or job execution
- **THEN** workers proceed independently and remain linked to the originating request

#### Scenario: Telemetry metadata is malformed

- **WHEN** otherwise valid work contains absent or invalid propagation metadata
- **THEN** payload processing continues with fresh context rather than rejecting the work

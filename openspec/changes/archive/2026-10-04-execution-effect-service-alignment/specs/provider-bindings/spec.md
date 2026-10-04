## ADDED Requirements

### Requirement: Local provider domain dependencies are replaceable

Local provider operations SHALL support deterministic dependency substitution within the provider lifetime while preserving existing synchronous queries, Promise APIs, public error constructors and codes, namespaces, capability declarations, and immutable results.

#### Scenario: Provider runs with test storage and clock

- **WHEN** local provider domain operations receive deterministic storage and clock implementations
- **THEN** operations use those implementations without acquiring hidden production authority

### Requirement: Local provider coordination preserves durable semantics

Owned workers and polling SHALL stop during provider shutdown, with finalization on failure and interruption. Durable acknowledgement ordering, retry transitions, recovery, idempotency receipts, fencing and filesystem coordination between processes SHALL remain authoritative. Ephemeral overflow SHALL retain drop-newest behavior and independent delivery SHALL retain failure isolation.

#### Scenario: Different processes share local state

- **WHEN** two local provider owners mutate the same durable state
- **THEN** filesystem coordination preserves existing atomicity and fencing rather than relying solely on process-local synchronization

#### Scenario: Ephemeral capacity is exhausted

- **WHEN** a new ephemeral delivery arrives at its configured capacity
- **THEN** the new delivery is dropped under the existing policy without creating a durable backlog

#### Scenario: Shutdown interrupts polling

- **WHEN** a local provider is closed while a worker waits or polls
- **THEN** owned work stops and its locks, listeners and temporary resources are released

## ADDED Requirements

### Requirement: Execution dependencies are substitutable within an owning lifetime

Execution domain operations SHALL compose lazily with explicitly supplied dependencies. A caller SHALL be able to substitute deterministic implementations without domain code overriding those dependencies. Existing synchronous and Promise execution boundaries SHALL retain their results, safe errors, context propagation, and authoring contracts.

#### Scenario: Execution uses substituted dependencies

- **WHEN** an invocation is executed with deterministic clock, provider, and observation implementations
- **THEN** domain work uses those implementations throughout the owning execution without constructing replacement production dependencies

#### Scenario: Generation startup partially fails

- **WHEN** startup fails after acquiring a prefix of required resources
- **THEN** acquired resources are released once in reverse order and the generation never admits traffic

### Requirement: Execution ownership survives deferred consumption

Streaming invocation resources SHALL remain owned until consumption completes, fails, is cancelled, or times out. Admission SHALL preserve the coordinated FIFO policy and count only admitted work. Task suspension SHALL release execution resources without reporting terminal failure or completion.

#### Scenario: Consumer returns early

- **WHEN** a caller stops consuming an invocation stream
- **THEN** stream work is interrupted, owned resources and admission are released once, and completion telemetry is emitted once

#### Scenario: Native task suspends

- **WHEN** a task enters a durable wait
- **THEN** its attempt releases admission without running terminal hooks or terminal outcome counters

## ADDED Requirements

### Requirement: Jobs deployment publishes workers before activating submissions

Jobs deployment SHALL retain existing infrastructure/deployment ownership and stage infrastructure selection/provisioning, secrets, immutable worker publication, native executable registration, capability/readiness verification, owned schedules and HTTP/client activation in that order. Native publication failure SHALL block activation. Repeated deployment SHALL be idempotent and compensation SHALL touch only owned resources. Provider runtime/Bun incompatibilities SHALL be diagnosed before publication.

#### Scenario: Native task deploy fails

- **WHEN** infrastructure succeeds but executable registration fails
- **THEN** new trigger endpoints and schedules do not activate against absent code

#### Scenario: Bun-only task targets incompatible worker

- **WHEN** managed execution cannot run a task's imported runtime modules
- **THEN** deployment emits source diagnostics instead of claiming compatible Bun execution

### Requirement: Rollout rollback and retirement preserve accepted work

Accepted runs SHALL pin stable task/job/version/build/service-generation and schema identity. Rollback SHALL select a prior compatible build for new work without migrating active work. Service/key retirement, shrinking and retention changes SHALL expose impacts and preserve routing through the supported run horizon or require explicit drain decisions. Public API naming changes SHALL not silently replace durable identities.

#### Scenario: Roll back while old and new runs execute

- **WHEN** a prior build is reactivated for new submissions
- **THEN** each accepted run continues on its original build and new runs use the selected rollback build

## ADDED Requirements

### Requirement: Execution domain operation telemetry is standalone and bounded

Every independently callable execution domain operation SHALL emit its execution count, terminal outcome, monotonic duration, applicable workload counts, and meaningful structured logs through supplied telemetry context. Outcomes SHALL distinguish success, expected failure, defect and interruption. Metric dimensions SHALL use bounded domain/operation/outcome labels; payloads, secrets and dynamic identities SHALL NOT become automatic metric labels or log content. Compatibility adapters SHALL NOT duplicate owning-operation counts.

#### Scenario: Domain operation is called directly

- **WHEN** a caller executes a provider, engine, runtime or transport domain operation without an enclosing stage
- **THEN** the operation emits its own bounded telemetry through the caller's context

#### Scenario: Operation is constructed but not executed

- **WHEN** an instrumented operation is only constructed
- **THEN** workload getters, logs and metrics are not evaluated

#### Scenario: Observer fails

- **WHEN** telemetry observation fails
- **THEN** the original operation result, typed failure, defect or interruption is preserved

### Requirement: Child logging configuration is isolated

Owned child work SHALL inherit structured annotations and logger configuration. An operation-local minimum-level override SHALL affect that child workflow without changing its parent or siblings. Actual configured sinks SHALL receive redacted lifecycle, recovery and failure events at their enabled levels.

#### Scenario: Child changes its minimum level

- **WHEN** one child workflow overrides its minimum log level before forking
- **THEN** the child's output reflects that level while parent and sibling configuration remain unchanged

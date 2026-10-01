## ADDED Requirements

### Requirement: Compiler operation telemetry is complete and bounded

Independently callable compiler domain operations SHALL record execution count, outcome, monotonic duration, and applicable workload counts in the caller's telemetry context, whether invoked directly or within a larger compilation. Outcomes SHALL distinguish success, expected failure, unexpected defect, and interruption. Operation, stage, outcome, and workload labels SHALL come from bounded declaration-owned sets; raw paths, descriptor identities, candidate content, credentials, and environment values SHALL NOT become metric labels or automatically captured log content.

#### Scenario: An operation is called independently

- **WHEN** a caller executes a package resolution, source analysis, normalization, planning, generation, or publication operation without an enclosing compiler stage
- **THEN** that operation records its own execution, terminal outcome, duration, and applicable workload counts

#### Scenario: Nested operations and a compatibility adapter execute

- **WHEN** a composed workflow executes distinct child operations through an existing compatibility adapter
- **THEN** each owning operation is counted once under its own bounded label and the adapter does not increment those counts again

#### Scenario: The operation fails or is interrupted

- **WHEN** an operation returns a typed failure, produces a defect, or is interrupted
- **THEN** its terminal outcome and duration are recorded once while preserving the operation's failure or interruption semantics

#### Scenario: Construction has not been executed

- **WHEN** a caller constructs an instrumented operation but does not execute it
- **THEN** workload getters are not evaluated and execution, duration, and outcome metrics remain unchanged

### Requirement: Compiler telemetry respects evaluator output ownership

Compiler instrumentation SHALL preserve the evaluator's output protocol and candidate side-effect observations. Instrumentation running while native candidate-output hooks are owned SHALL avoid emitting into those captured streams. Logger and exporter provisioning SHALL remain at runtime boundaries rather than being installed by compiler domain operations.

#### Scenario: Candidate output hooks are active

- **WHEN** instrumented discovery operations run while a candidate owns native output interception
- **THEN** compiler telemetry does not appear as candidate stdout, stderr, or a direct-output side-effect diagnostic

#### Scenario: A caller supplies a telemetry sink

- **WHEN** the caller provisions a logger, tracer, or metric registry for compiler execution
- **THEN** compiler operation signals use that context without installing a competing sink or placing telemetry metadata in generated artifact bytes

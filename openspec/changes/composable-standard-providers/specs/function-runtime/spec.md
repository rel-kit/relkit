## MODIFIED Requirements

### Requirement: Managed generation lifecycle

Environment resolution, graph-required binding construction, handler/resource/trigger registration, internal APIs, readiness, traffic activation, draining, and binding release SHALL occur in dependency order, and shutdown SHALL stop new work before releasing acquired bindings in reverse order. Failure of one binding SHALL not construct or expose unrelated bindings.

#### Scenario: Required binding construction fails

- **WHEN** a required bucket binding fails validation or connectivity
- **THEN** the generation never becomes ready, acquired bindings are released, and cache, jobs, events, models, and observability credentials are not supplied to it

### Requirement: Deterministic application test harness

`@relkit/testing` SHALL provide isolated runtime/application helpers with validated test environment values, deterministic IDs and clock, in-memory HTTP, controlled job/event delivery, scripted models, bucket/cache fakes, telemetry queries, failure injection, and restart against shared test state. Configured external or managed adapters SHALL be replaced by fakes unless an integration test explicitly opts in.

#### Scenario: Test runtime is created

- **WHEN** a test creates an application runtime without opting into configured adapters
- **THEN** it receives isolated deterministic bindings and requires no provider connection values or credentials

#### Scenario: Integration adapter is selected

- **WHEN** a test explicitly opts into configured adapters and supplies valid environment values
- **THEN** the requested real bindings run while normal secret safety and lifecycle behavior remains enforced

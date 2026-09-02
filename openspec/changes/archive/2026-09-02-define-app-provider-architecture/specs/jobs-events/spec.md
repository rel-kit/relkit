## ADDED Requirements

### Requirement: Job and event runtimes use provider bindings

Job and event execution SHALL resolve independent physical profiles through the common provider-binding and runtime-integration plans, construct only graph-required bindings, and isolate each binding's configuration, credentials, health, and lifecycle from every other capability.

#### Scenario: Connected queue and infrastructure event bus coexist

- **WHEN** jobs select a configured queue adapter and events select an infrastructure-owned event adapter
- **THEN** runtime wires each independently and deployment creates lifecycle operations only for the infrastructure-owned binding

#### Scenario: One async integration is unavailable

- **WHEN** an unused event profile lacks required values while the graph requires only jobs
- **THEN** job readiness is unaffected and the event runtime is not loaded

## REMOVED Requirements

### Requirement: Job and event bindings are independent

**Reason**: The requirement encodes the removed `external` and `managed` ownership terminology and embedded adapter-resolution model.

**Migration**: Configure job and event profile bindings with connected or infrastructure sources; independence is retained by the new provider-binding requirement.

#### Scenario: Legacy ownership is used for async bindings

- **WHEN** jobs or events declare external or managed ownership
- **THEN** compilation rejects the old binding representation


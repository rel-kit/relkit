## ADDED Requirements

### Requirement: Service identity is attached without context leakage

Invocations, structured logs, spans, traces, and inspector records for a service member SHALL include stable service and member-function identities, while enriched service-context values SHALL remain uncaptured unless an existing explicit bounded and redacted capture rule permits them.

#### Scenario: Service member logs

- **WHEN** `OrderService.getOrder` emits an application log
- **THEN** the log identifies the service, function, invocation, and trace without automatically serializing principal, tenant, request, or middleware context

#### Scenario: Standalone service member runs

- **WHEN** a service-scoped member is invoked through the standalone kernel
- **THEN** its lifecycle and log records retain service attribution even without an HTTP request or application provider set

### Requirement: Dynamic function calls are observable relationships

Function descriptor calls SHALL emit bounded observed relationships and correlated parent/child invocation records without being inserted into the canonical declared graph.

#### Scenario: Function invokes sibling service member

- **WHEN** one service member invokes another through `invoke`
- **THEN** telemetry records the caller, callee, service, parent/child IDs, and shared trace ID and leaves the graph hash unchanged

#### Scenario: Dynamic cycle is rejected

- **WHEN** runtime invocation-chain protection rejects a function-call cycle
- **THEN** the attempted observed edge and safe policy failure remain correlated for diagnosis without exposing handler internals


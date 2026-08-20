## ADDED Requirements

### Requirement: Rate-limit telemetry is bounded and correlated

Rate-limit decisions SHALL add bounded low-cardinality request/span fields for route, outcome, configured limit, remaining count, and reset time without recording raw keys or secret request values.

#### Scenario: Request is rate limited

- **WHEN** a route rejects a request with `429`
- **THEN** its request record and trace identify the rate-limit outcome and policy metadata without exposing the derived key

### Requirement: Trace presentation uses existing safe contracts

Inspector trace visualization SHALL derive hierarchy, timing, status, attributes, and correlated links from versioned redacted trace/query APIs and SHALL NOT require application handlers, live span objects, or an alternate telemetry store.

#### Scenario: Trace detail is loaded

- **WHEN** the inspector requests a trace
- **THEN** all displayed content comes from the existing protected redacted API contract and does not mutate telemetry state

## MODIFIED Requirements

### Requirement: Complete correlated runtime signals

The observability capability SHALL record request lifecycles, function invocations, route rate-limit decisions, job attempts, event publications/deliveries, bucket/cache operations, tool calls, agent model turns, structured logs, spans/traces, diagnostics, and generation lifecycle events with shared correlation identifiers.

#### Scenario: HTTP flow causes child work

- **WHEN** a request passes rate limiting, invokes a function, accesses cache, publishes an event, and enqueues a job
- **THEN** rate-limit decision, request, invocation, operations, logs, and spans share the correct request/trace/invocation relationships

#### Scenario: HTTP flow is rate limited

- **WHEN** a request is rejected before target invocation
- **THEN** one safe request record and trace capture the `429` outcome without fabricating a function invocation

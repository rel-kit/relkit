## ADDED Requirements

### Requirement: Typed callback listener context

An event callback SHALL receive the validated event payload followed by a framework-neutral context containing envelope identity, version, key, attributes, occurrence time, trace, correlation, causation, cancellation, logging, and only declared dependency clients.

#### Scenario: Callback receives an event

- **WHEN** a known event is delivered to a callback listener
- **THEN** its payload type matches the registered event and its context preserves the accepted envelope metadata

#### Scenario: Callback invokes a dependency

- **WHEN** a listener declares and calls another framework capability
- **THEN** that call is typed, correlated, and executed through the same engine/provider boundary as a normal function dependency

## MODIFIED Requirements

### Requirement: Compile-time event selector expansion

Known event-name strings, `anyOf`, `match`, and restricted raw-all selectors SHALL compile from the generated event registry into sorted known event ID/version pairs and corresponding callback payload contracts; runtime providers SHALL route those explicit pairs rather than reinterpret source patterns.

#### Scenario: One event name is selected

- **WHEN** a listener names a known event string
- **THEN** its callback receives that event's payload type and the graph stores its exact ID/version pair

#### Scenario: Any-of selector expands

- **WHEN** a listener selects several known event names
- **THEN** its callback input can narrow a discriminated union by event ID/version and the graph stores the sorted expansion

#### Scenario: Raw all-event listener is used

- **WHEN** a listener opts into raw unknown payload capture for audit, telemetry, or development tooling
- **THEN** compilation emits the required volume/sensitive-data warning and rejects use outside the restricted policy

### Requirement: Explicit event delivery modes

Listeners SHALL default to durable at-least-once delivery with the current one-attempt retry policy unless configured otherwise; ephemeral listeners SHALL provide transient delivery with no restart-recovery claim, while durable listeners SHALL persist acceptance, use leases/retries/dead-lettering, recover after restart, and allow duplicate delivery after an acknowledgement gap.

#### Scenario: Delivery is omitted

- **WHEN** a listener does not declare `delivery`
- **THEN** compilation and runtime use durable delivery with one attempt unless a retry policy is supplied

#### Scenario: Ephemeral provider restarts

- **WHEN** an ephemeral event has not completed delivery before process loss
- **THEN** the provider does not claim or synthesize recovery

#### Scenario: Durable provider restarts

- **WHEN** accepted durable delivery state exists across restart
- **THEN** pending or expired work is recovered and can be drained through the common function engine

### Requirement: Event listeners remain trigger concepts

Graph output, generated source, public exports, APIs, inspector terminology, and tests SHALL represent callback listeners as event triggers targeting generated internal functions and SHALL contain no separate subscription descriptor or graph resource.

#### Scenario: Full event fixture compiles

- **WHEN** events and callback `onEvent` bindings are compiled
- **THEN** the graph contains event nodes, generated function nodes, and generic trigger nodes only, and a source scan finds no generated `*.subscription.ts`

#### Scenario: One listener fails during fan-out

- **WHEN** independently lowered callback listeners receive the same event and one fails
- **THEN** each trigger retains independent retry/dead-letter state and other accepted deliveries are not revoked

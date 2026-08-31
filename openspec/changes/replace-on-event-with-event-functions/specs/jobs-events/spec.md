## ADDED Requirements

### Requirement: Exact event functions consume independently

Each `defineEventFunction` SHALL bind one exact known event ID to one authored event-only function and one generated trigger; accepted events SHALL still fan out to zero, one, or many matching triggers whose acknowledgement, retry, replay, and dead-letter state remain independent.

#### Scenario: Two event functions receive one event

- **WHEN** two durable event functions name the same event and one handler fails
- **THEN** the successful delivery completes while the failed delivery follows only its own retry and dead-letter policy

### Requirement: Event function context preserves delivery metadata

An event function SHALL receive parsed event input and a context separating event identity, one-based delivery attempt/replay state, and trace/correlation/causation metadata while retaining ordinary declared managed capabilities.

#### Scenario: Retried delivery reaches a handler

- **WHEN** a durable delivery is retried
- **THEN** `context.trigger.delivery.attempt` increases, replay state is accurate, and the accepted envelope identity remains available

## MODIFIED Requirements

### Requirement: Versioned event contracts and envelopes

An event SHALL have an explicit stable ID, an optional positive integer version defaulting to `1`, validated `input`, and optional sensitive-field metadata; publishing SHALL create a validated envelope with instance/event/version/time, key, attributes, correlation, causation invocation, and trace information.

#### Scenario: Event is published from a function

- **WHEN** a function declares the event ID in `publishes` and publishes valid input
- **THEN** the provider validates it, creates one correlated envelope, and returns acceptance metadata without waiting for consumers

#### Scenario: Event input is invalid

- **WHEN** publication input violates the event schema
- **THEN** publication is rejected before any delivery is accepted

## REMOVED Requirements

### Requirement: Compile-time event selector expansion

**Reason**: The business event API now binds each event function to one exact registry ID.

**Migration**: Repository-owned broad reactions SHALL be split into explicit event functions; no selector compatibility layer is provided.

#### Scenario: Selector API is referenced

- **WHEN** source imports selector helpers or selector types
- **THEN** the removed API is unavailable

### Requirement: Event listeners remain trigger concepts

**Reason**: Authored event functions replace callback listeners and hidden generated functions while retaining generated graph triggers.

**Migration**: Repository-owned callbacks SHALL become explicitly identified `defineEventFunction` declarations.

#### Scenario: Event function is compiled

- **WHEN** a new event function is discovered
- **THEN** no hidden listener function or subscription resource is generated

### Requirement: Typed callback listener context

**Reason**: `EventFunctionContext` replaces the callback-specific context.

**Migration**: Handlers SHALL read envelope, delivery, and trace data from `context.trigger`.

#### Scenario: Callback context type is imported

- **WHEN** source imports the removed callback context type
- **THEN** type checking fails until it uses the event-function context

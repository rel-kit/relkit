## ADDED Requirements

### Requirement: Event functions lower to authored functions and exact triggers

The compiler SHALL emit one authored function node marked `event-only` and one deterministic `relkit.event.<function-id>.trigger` node for each event function, with one target edge and one exact listener edge, without a hidden generated function or duplicate consumer edge.

#### Scenario: Event function compiles

- **WHEN** a valid event function names a known event
- **THEN** its function input matches the event schema, its output is void, and its trigger stores the exact event ID/version and normalized delivery configuration

### Requirement: Event-only and publication diagnostics are source located

Compilation SHALL diagnose unknown consumer events, unknown or duplicate publications, forbidden event-function fields/results/targets, non-event invocation paths, and generated-trigger identity collisions with the authored ID, invalid target, source location, and correction.

#### Scenario: Route targets an event function

- **WHEN** a route references an event-only function
- **THEN** compilation emits a source-located error and no activatable manifest

## MODIFIED Requirements

### Requirement: Generated typed event registry

Compilation SHALL generate a deterministic TypeScript declaration mapping discovered event IDs to input, version, and descriptor types before project type checking, and SHALL use the same registry to validate `publishes` and event-function event names.

#### Scenario: Event is added

- **WHEN** a new event descriptor is discovered by `relkit dev`, `relkit check`, or project creation
- **THEN** the registry is atomically refreshed and editor/type-checking consumers can autocomplete its ID

#### Scenario: Event is removed

- **WHEN** a publisher or event function still names a removed event
- **THEN** stale generated declarations cannot make compilation succeed and an unknown-event diagnostic is emitted

## REMOVED Requirements

### Requirement: Callback listeners lower through the common engine

**Reason**: Event functions are authored common-engine functions, so hidden callback lowering is obsolete.

**Migration**: All repository-owned callbacks SHALL be rewritten as event functions in the same breaking change.

#### Scenario: Legacy callback is compiled

- **WHEN** source uses the removed callback API
- **THEN** discovery cannot produce an activatable legacy listener

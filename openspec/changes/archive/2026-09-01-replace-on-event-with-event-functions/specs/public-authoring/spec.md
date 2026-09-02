## ADDED Requirements

### Requirement: Event contracts, publishers, and event functions are distinct

RELKIT SHALL expose contract-only `defineEvent`, callable `defineFunction`, and event-only `defineEventFunction` primitives; normal and event functions SHALL declare exact publishable event IDs through `publishes`, and only those IDs SHALL appear in `context.events`.

#### Scenario: Event relationship is authored

- **WHEN** an application defines an event, a publisher, and an event function using known registry IDs
- **THEN** the publisher can publish through its narrowed context and the event function receives the parsed event input without exposing direct invocation or tool conversion

#### Scenario: Invalid event-only fields are authored

- **WHEN** `defineEventFunction` declares `input`, `output`, `tool`, or `trigger`
- **THEN** type checking and compilation reject the field with a source-located correction

## MODIFIED Requirements

### Requirement: Serializable route and selector DSLs

HTTP request/response mappings SHALL be declarative and serializable, SHALL preserve type relationships to their target functions, and SHALL reject arbitrary executable mapping closures; business event functions SHALL name one exact generated-registry event rather than expose a selector DSL.

#### Scenario: Route mapping is projected

- **WHEN** a route maps path, query, header, cookie, JSON body, multipart, constant, nested, optional, default, or named-transform values
- **THEN** the mapping can be serialized into the graph and checked against the target input

#### Scenario: Named transform is declared

- **WHEN** a route binds a stable transform ID to a Standard Schema-compatible validator/transform
- **THEN** the graph contains only the ID and deterministic schema projection while the executable validator is resolved through the hash-matched runtime manifest

#### Scenario: Event selector combines known events

- **WHEN** `defineEventFunction` names a known event ID
- **THEN** its input is inferred from that exact event and no wildcard or multi-event selector is authored

## REMOVED Requirements

### Requirement: Event listeners are generic trigger bindings

**Reason**: `defineEventFunction` makes the existing function execution resource explicit and removes the callback/listener wrapper.

**Migration**: Repository-owned source SHALL use `defineEventFunction`; no alias or compatibility API is retained.

#### Scenario: Removed listener API is referenced

- **WHEN** source imports `onEvent` or selector helpers
- **THEN** the import fails because the removed exports no longer exist

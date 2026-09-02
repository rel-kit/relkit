## ADDED Requirements

### Requirement: Event functions are enforced event-only functions

Event functions SHALL use the common function engine with `invocationMode: "event-only"`, SHALL accept only event delivery or replay sources, and SHALL reject direct, nested, HTTP, service, job, schedule, tool, agent, conversion, or forged-reference invocation paths at type, compilation, registration, and runtime boundaries.

#### Scenario: Event delivery invokes an event function

- **WHEN** a provider delivers or replays the configured event
- **THEN** the common engine validates the payload, supplies event delivery context, and accepts a successful void result or declared error result

#### Scenario: Non-event path targets an event function

- **WHEN** any callable or trigger path other than event delivery/replay targets an event-only function
- **THEN** the nearest trusted boundary rejects it without running the handler

### Requirement: Publication clients are explicitly narrowed

Normal and event functions SHALL receive event publisher clients only for unique known IDs declared in `publishes`, and runtime access SHALL enforce the same permission when static typing is bypassed.

#### Scenario: Event function republishes its consumed event

- **WHEN** an event function lists its consumed event in `publishes`
- **THEN** the matching context client is available and publishes with preserved invocation causation

#### Scenario: Consumed event is not declared for publication

- **WHEN** an event function does not list its consumed event in `publishes`
- **THEN** that event is absent from its typed context and runtime access is rejected

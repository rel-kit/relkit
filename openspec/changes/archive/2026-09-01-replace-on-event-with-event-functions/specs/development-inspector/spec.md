## ADDED Requirements

### Requirement: Inspector presents authored event functions

Event views SHALL join generated trigger-to-event and trigger-to-function edges to show authored event functions as consumers, and function views SHALL distinguish callable and event-only invocation modes while retaining publisher, delivery, retry, replay, and dead-letter state.

#### Scenario: Event detail renders consumers

- **WHEN** an event has publishers and multiple event functions
- **THEN** the page links each authored function, shows its independent runtime state, and exposes no selector expansion or hidden listener function

## ADDED Requirements

### Requirement: Documentation teaches event functions and explicit publication

Documentation and generated API references SHALL describe `defineEvent`, `defineFunction.publishes`, `defineEventFunction`, exact event IDs, narrowed publisher context, independent delivery, and event trigger context, and SHALL contain no supported `onEvent`, selector, or `dependencies.events` guidance.

#### Scenario: Event guides are generated

- **WHEN** documentation generation completes
- **THEN** the event and listener guides use executable repository examples of publishers and event functions and preserve asynchronous receipt/fan-out semantics

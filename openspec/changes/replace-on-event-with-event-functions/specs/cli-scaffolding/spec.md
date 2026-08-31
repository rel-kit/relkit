## MODIFIED Requirements

### Requirement: API template explains independent event fan-out

The API template SHALL include one contract-only domain event, one normal function that declares it in `publishes`, and at least two independently testable `defineEventFunction` reactions with distinct responsibilities; its documentation SHALL state at-least-once and independent-failure semantics without selectors, callback listeners, or compatibility APIs.

#### Scenario: Template event is published

- **WHEN** the example publishes its domain event
- **THEN** both event functions become eligible, one function's failure cannot roll back the other's success, and deterministic tests can deliver and inspect each independently

## ADDED Requirements

### Requirement: Event-function deployment remains least privilege

AWS deployment SHALL create durable EventBridge/SQS trigger resources from generated exact-event triggers and SHALL derive publisher IAM permissions only from function `publishes-event` edges.

#### Scenario: Function publishes one event

- **WHEN** a function declares one event in `publishes`
- **THEN** its service policy permits that event publication and does not grant unrelated event permissions

#### Scenario: Durable event function is deployed

- **WHEN** an event function uses durable delivery
- **THEN** deployment creates the existing independently retryable consumer resources using its deterministic generated trigger ID

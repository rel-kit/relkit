## ADDED Requirements

### Requirement: Job and event bindings are independent

Jobs and events SHALL resolve through separate capability/profile bindings, and neither binding SHALL receive configuration or credentials owned by the other or by buckets, cache, models, observability, or hosting.

#### Scenario: SQS and EventBridge bindings coexist with R2

- **WHEN** jobs use a managed SQS binding, events use a managed EventBridge binding, and buckets use external R2
- **THEN** each adapter receives only its own resolved references and an R2 failure cannot prevent unused job or event adapters from being instantiated correctly

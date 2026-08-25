## MODIFIED Requirements

### Requirement: Managed capability and agent workflows

Bucket, cache, job, event, model, and observability views SHALL show logical descriptor/profile relationships plus provider capability, adapter, ownership, required status, and safe environment-reference metadata. Inspector APIs and views SHALL never resolve or display connection or credential values.

#### Scenario: Provider topology is inspected

- **WHEN** an application mixes external R2, external Redis, and managed AWS bindings
- **THEN** the inspector clearly labels each binding and links required resources without implying that hosting owns external resources

#### Scenario: Provider reference is secret

- **WHEN** a binding includes secret environment references
- **THEN** the inspector shows only variable names and sensitivity metadata

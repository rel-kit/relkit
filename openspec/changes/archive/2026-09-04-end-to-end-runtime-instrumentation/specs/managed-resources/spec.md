## ADDED Requirements

### Requirement: Logical managed operation spans

Cache, bucket and database logical operations SHALL emit one operation span at call time. Transactions SHALL parent their contained operations and end after commit or rollback. Overrides, recovery reads and internal transaction mechanics SHALL remain inside the logical operation.

#### Scenario: Database activation is reused

- **WHEN** a cached activation is reused by another request or generation
- **THEN** its operations use that caller's current context and sink without retaining earlier request identity

#### Scenario: MySQL mutation performs recovery

- **WHEN** an overridden mutation uses an internal transaction and recovery read
- **THEN** the logical mutation is represented once and failure/rollback is correctly recorded

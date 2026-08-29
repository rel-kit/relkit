## ADDED Requirements

### Requirement: Specialized services share the managed generation lifecycle
Runtime startup SHALL resolve environment values, activate the sole Drizzle service once, activate the sole Better Auth service after its database and route metadata are available, and SHALL not report readiness until providers and specialized services are ready.

#### Scenario: Database startup fails
- **WHEN** the lazy Drizzle client factory rejects
- **THEN** the generation remains not ready, application traffic is not admitted, and no disposal callback is invoked for the failed activation

#### Scenario: Generation shuts down
- **WHEN** an activated generation drains and stops
- **THEN** the Drizzle disposal callback runs at most once and failure does not prevent remaining cleanup attempts

### Requirement: Generated application context reflects active services
Function context SHALL expose the resolved application environment type, the Drizzle service's typed database models and transactions, and the Better Auth service's inferred session through `auth.getSession` without a service-context patch field.

#### Scenario: Function uses application capabilities
- **WHEN** a compiled function reads an environment key, custom database model, and authentication session
- **THEN** all three are statically typed and resolve from the active generation at runtime


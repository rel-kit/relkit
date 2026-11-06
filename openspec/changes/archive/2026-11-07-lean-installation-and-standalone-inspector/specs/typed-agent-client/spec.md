
## ADDED Requirements

### Requirement: Generic client entrypoints do not require frontend bindings
Root and server client entrypoints SHALL install and typecheck without React, TanStack or @orpc/tanstack-query packages or types. Frontend integrations SHALL be optional and isolated at their explicit entrypoints. DefaultContractRegistry augmentation authority, generated inference and existing runtime support boundaries SHALL be preserved.

#### Scenario: Server consumer compiles a generated client
- **WHEN** a packed server fixture uses generated contracts with skipLibCheck false and no frontend dependencies
- **THEN** correct calls infer their current types, invalid calls fail and no frontend declaration needs resolution

#### Scenario: Frontend bindings are explicitly selected
- **WHEN** a consumer installs the documented peers and imports the React or TanStack entrypoint
- **THEN** existing typed interaction, observation, cleanup and supported rendering behavior remains available

### Requirement: Diagnostic inspection does not change durable client streams
Optional inspection, bounded diagnostic capture and unavailable UI/store SHALL NOT alter agent/job execution identity, authorization, durable event replay, cancellation or continuation contracts.

#### Scenario: Inspector disconnects during an interrupted agent run
- **WHEN** the tool disconnects or drops diagnostic records while a typed client observes and resumes authorized work
- **THEN** the same thread/run and durable event semantics remain valid and tool closure does not cancel the work

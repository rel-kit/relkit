## ADDED Requirements

### Requirement: Transport workflows use substitutable execution dependencies

HTTP and RPC transport workflows SHALL delegate domain work through caller-owned execution dependencies, preserving synchronous application construction, Promise engine interfaces, middleware ordering, authorization, safe error mapping, and existing transport frames.

#### Scenario: Transport invokes a substituted domain implementation

- **WHEN** a request runs against deterministic execution dependencies
- **THEN** the transport uses those dependencies while applying the existing input, identity, authorization and response contracts

### Requirement: Accepted execution and observation have distinct lifetimes

Accepted agent work SHALL belong to its generation rather than an observing request. Closing observation SHALL release its stream resources without cancelling accepted work. Generation retirement SHALL terminate generation-owned execution. Response records and spans SHALL finish once at body completion/cancellation, or immediately for bodyless responses.

#### Scenario: Agent SSE observer disconnects

- **WHEN** a client disconnects after agent work has been accepted
- **THEN** observation closes while accepted work remains available for later replay

#### Scenario: Authorization expires during observation

- **WHEN** authorization or a job watch grant becomes invalid during streaming
- **THEN** the next protected observation is rejected under the existing safe mapping and cursor scope contract

#### Scenario: Response body is cancelled

- **WHEN** the host cancels a streamed response body
- **THEN** body resources are released and one terminal request event and root span completion are recorded

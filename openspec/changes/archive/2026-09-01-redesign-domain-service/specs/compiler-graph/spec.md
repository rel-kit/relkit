## ADDED Requirements

### Requirement: Domain ownership and exposure are canonical graph data
Every domain-owned graph node SHALL carry its domain ID, functions/events/errors SHALL declare public or internal exposure, and service nodes SHALL contain serializable public membership and optional Drizzle or Better Auth capability metadata.

#### Scenario: Graph is serialized
- **WHEN** a compiled application graph is encoded as JSON
- **THEN** it contains no live clients, handlers, callbacks, credentials, raw Drizzle objects, or filesystem-root-dependent identities

### Requirement: Domain relationships use explicit graph edges
The graph SHALL represent public function/event exposure, service dependencies, auth mounts, and function-declared errors using versioned deterministic edges while preserving runtime-observed invocation edges separately.

#### Scenario: Domain imports another service
- **WHEN** one or more files in `billing` import `orders/service.ts`
- **THEN** the graph contains one deterministic `billing` to `orders` service dependency edge without inventing exact function-call edges

### Requirement: Errors are first-class graph nodes
Declared errors SHALL be deduplicated as graph nodes with safe schema, HTTP, retry, source, domain, and exposure metadata and SHALL remain projected into function contracts for HTTP and client generation.

#### Scenario: Error is shared
- **WHEN** several functions declare the same error descriptor
- **THEN** the graph contains one error node and one declaration edge from each function


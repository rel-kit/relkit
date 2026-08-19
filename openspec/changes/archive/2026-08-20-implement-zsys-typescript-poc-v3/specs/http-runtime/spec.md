## Purpose

Defines observable HTTP routing, request/response conversion, internal endpoints, OpenAPI generation, and typed client behavior derived from the application graph.

## ADDED Requirements

### Requirement: Graph-driven HTTP materialization

The HTTP runtime SHALL create its route table exclusively from planned HTTP trigger nodes and hash-matched function-backed middleware adapters, and application handlers SHALL never receive or depend on the underlying HTTP framework context.

#### Scenario: Route starts successfully

- **WHEN** a valid HTTP trigger targets a registered function
- **THEN** the runtime registers the method/path and invokes that function through the common engine with source `http`

#### Scenario: Declared middleware runs

- **WHEN** a route contains ordered middleware references
- **THEN** each adapter invokes its declared function through the common engine with framework-neutral validated input and applies only its declared continue-or-respond decision

### Requirement: Deterministic route precedence and collision rejection

Routes SHALL be ordered by exact static path, parameterized path, wildcard path, and stable registration ID tie-breaker, and duplicate normalized method/path pairs SHALL fail compilation before startup.

#### Scenario: Static and parameter routes overlap

- **WHEN** `/orders/new` and `/orders/:id` both match an incoming path
- **THEN** the exact static route is selected deterministically

#### Scenario: Normalized collision exists

- **WHEN** two routes declare the same HTTP method and normalized path
- **THEN** compilation emits `ZSYS_ROUTE_COLLISION` and no server generation becomes activatable

### Requirement: Serializable request mapping execution

The runtime SHALL execute the compiled mapping model for path, query, header, cookie, JSON body, whole body, multipart, constants, nested objects, optional/default values, and named transforms, and SHALL enforce content type, body size, parsing, and target input validation before handler invocation.

#### Scenario: Valid mapped request arrives

- **WHEN** request values satisfy the route mapping and target function schema
- **THEN** the target receives exactly the mapped typed input with no transport object

#### Scenario: Named transform executes

- **WHEN** a mapping references a declared transform ID
- **THEN** the runtime resolves the hash-matched manifest validator, applies it before target admission, and reports a safe validation failure without calling the target when it fails

#### Scenario: Malformed body arrives

- **WHEN** JSON is malformed, content type is wrong, the body is too large, or mapped values fail validation
- **THEN** the runtime returns the declared safe validation response, records the failure, and does not call the handler

### Requirement: Declared response mapping

The HTTP runtime SHALL convert successful values, declared application errors, validation failures, timeouts, cancellation, and unexpected defects using route response declarations, and SHALL validate response bodies in development and test.

#### Scenario: Declared error maps to HTTP

- **WHEN** a target function throws a declared error named in the route responses
- **THEN** the configured status and safe error envelope are returned and the request outcome is `declared-error`

#### Scenario: Unexpected defect occurs

- **WHEN** the target produces an unexpected defect
- **THEN** the client receives a generic safe server response while correlated diagnostic detail remains internal

### Requirement: Request lifecycle propagation

HTTP handling SHALL create or propagate request and trace IDs, record route matching and function invocation, honor middleware order, cancel work when a real client disconnects, and emit one correlated request record and trace for every accepted request.

#### Scenario: Client disconnects

- **WHEN** a connected client closes before the response completes
- **THEN** the function's `ctx.signal` is aborted and the request outcome is recorded as cancelled

### Requirement: Versioned internal endpoints

The backend SHALL expose versioned liveness, readiness, graph, request, log, trace, stream, and diagnostics endpoints under `/_zsys/v1`, and SHALL disable or protect them in production according to deployment configuration.

#### Scenario: Readiness is queried during startup

- **WHEN** required providers or registrations are not ready
- **THEN** liveness can succeed while readiness reports non-ready without exposing secrets

#### Scenario: Production protection is absent

- **WHEN** a production configuration would expose unprotected internal endpoints
- **THEN** startup or deployment validation rejects the configuration

### Requirement: OpenAPI 3.1 from contracts

The system SHALL generate deterministic OpenAPI 3.1 from route trigger metadata, schemas, declared errors, and response mappings rather than inspecting the live HTTP framework.

#### Scenario: Route contract is generated

- **WHEN** a valid route is compiled
- **THEN** its OpenAPI operation describes the same method, path, request, success response, validation response, and declared errors enforced at runtime

### Requirement: Generated typed HTTP client

The compiler SHALL generate a deterministic TypeScript client whose inputs and success/error outcomes follow the graph/OpenAPI route contracts and contain no dependency on runtime internals.

#### Scenario: Client calls a declared route

- **WHEN** application code uses a generated client method with valid input
- **THEN** TypeScript infers the route input and typed status/result union

### Requirement: HTTP test surfaces

The testing package SHALL provide in-memory HTTP requests for ordinary integration tests and a real Bun listener path for disconnect, streaming, and supervisor proxy behavior.

#### Scenario: Route integration test runs

- **WHEN** a test sends an in-memory request to a test application
- **THEN** it can assert status/body plus correlated request, log, trace, and fake-provider effects without binding a port

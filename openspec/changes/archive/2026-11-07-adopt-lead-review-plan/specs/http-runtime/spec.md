# Spec Delta

## MODIFIED Requirements

### Requirement: Declared response mapping

The HTTP runtime SHALL convert successful values, declared errors, validation failures, rate limits,
timeouts, cancellation, authentication and access failures, unmatched routes and unexpected defects
using inferred or explicit route responses. Every error response SHALL be RFC 9457 Problem Details
with `type`, `title`, `status`, `code`, `detail`, optional `data` and `traceId`. Response bodies SHALL
be validated in development and test.

#### Scenario: Successful value is inferred

- **WHEN** a route without explicit responses returns a non-void target value
- **THEN** the runtime returns validated JSON with status `200` unless `successStatus` overrides it

#### Scenario: Void value is inferred

- **WHEN** a route without explicit responses returns void or undefined
- **THEN** the runtime returns `204` with no body

#### Scenario: Declared error maps to HTTP

- **WHEN** a target function throws a declared HTTP error
- **THEN** the response has its configured status, the `application/problem+json` content type and
  the error's `code` and `data`, and the request outcome is `declared-error`

#### Scenario: Validation fails

- **WHEN** request input fails validation
- **THEN** the response is a 422 Problem Details body with `code` set to `validation` and an `issues`
  array with paths

#### Scenario: Declared retry delay

- **WHEN** a declared error carries a retry delay
- **THEN** the response includes a `Retry-After` header

#### Scenario: Unexpected defect occurs

- **WHEN** the target produces an unexpected defect
- **THEN** the client receives a 500 Problem Details response without internal detail, while
  correlated diagnostic detail remains internal

#### Scenario: Unmatched route

- **WHEN** a request matches no route
- **THEN** the response is a 404 Problem Details body, or a 405 with an `Allow` header when the path
  exists for other methods

#### Scenario: HEAD route succeeds

- **WHEN** a `HEAD` route produces a normal successful response
- **THEN** status and headers are preserved while the response body is removed

### Requirement: Generated typed HTTP client

The compiler SHALL generate a deterministic TypeScript client exposed as an API object whose
properties mirror services and routes. Calls and hooks SHALL take those properties instead of string
keys, the error type SHALL include each declared error's `code`, `status` and `data`, catch-all
segments SHALL be encoded independently, and the client SHALL depend on neither runtime internals nor
Effect.

#### Scenario: Client calls a declared route

- **WHEN** application code calls `api.orders.get({ orderId })`
- **THEN** TypeScript infers the route input and the typed result and error unions

#### Scenario: Client calls an optional catch-all route

- **WHEN** a client call omits or supplies the optional segment array
- **THEN** it requests the correct concrete path with each supplied segment safely encoded

#### Scenario: Error code narrows the data type

- **WHEN** a call fails with a declared error
- **THEN** checking `error.code` narrows `error.data` to that error's data type

#### Scenario: Browser bundle

- **WHEN** the client is bundled for a browser
- **THEN** the bundle contains no Effect runtime

### Requirement: Better Auth protection precedes authored route middleware

The HTTP runtime SHALL enforce route-level authentication before authored route middleware and the
target function, exclude the auth service's own endpoints, and reuse one memoized session lookup
across middleware, access rules and function context.

#### Scenario: Protected request has no session

- **WHEN** a route with `auth: "required"` is requested without a session
- **THEN** a 401 Problem Details response is returned, and authored route middleware and the target
  function do not run

#### Scenario: Auth endpoints are requested

- **WHEN** a request targets the Better Auth endpoints
- **THEN** no route-level authentication applies to it

## ADDED Requirements

### Requirement: One wire protocol

The typed client SHALL call the same REST routes that the OpenAPI document describes, preserving
dates, large integers, files and streams, and the separate RPC endpoint SHALL be removed once nothing
calls it.

#### Scenario: Network trace

- **WHEN** a browser calls `api.orders.list()`
- **THEN** the request is `GET /orders`, as documented in OpenAPI

### Requirement: Client contract updates in development

In development, a frontend that uses the typed client SHALL pick up backend contract changes without
restarting its dev server.

#### Scenario: Backend adds an output field

- **WHEN** the backend adds an output field during development
- **THEN** the frontend's types and runtime client reflect it without a restart

## MODIFIED Requirements

### Requirement: Serializable request mapping execution

The runtime SHALL execute the compiled mapping model for path, query, header, cookie, JSON body, whole body, multipart, constants, nested objects, optional/default values, and named transforms, SHALL keep transport values distinct from body fields, and SHALL enforce content type, body size, parsing, and target input validation before handler invocation.

#### Scenario: Valid mapped request arrives

- **WHEN** request values satisfy the route mapping and target function schema
- **THEN** the target receives exactly the mapped reusable input plus a separate immutable framework-neutral request view

#### Scenario: Matching path field is inferred

- **WHEN** `/orders/:orderId` targets a function whose input contains `orderId`
- **THEN** inference maps the path value into that input field and OpenAPI describes it as a path parameter rather than request-body data

#### Scenario: Path field is not part of business input

- **WHEN** a path parameter has no matching target-input property
- **THEN** compilation does not require an artificial input field and the value remains available through `request.params`

#### Scenario: Named transform executes

- **WHEN** a mapping references a declared transform ID
- **THEN** the runtime resolves the hash-matched manifest validator, applies it before target admission, and reports a safe validation failure without calling the target when it fails

#### Scenario: Malformed body arrives

- **WHEN** JSON is malformed, content type is wrong, the body is too large, or mapped values fail validation
- **THEN** the runtime returns the declared safe validation response, records the failure, and does not call the handler

### Requirement: OpenAPI 3.1 from contracts

The system SHALL generate deterministic OpenAPI 3.1 from route trigger metadata, structured transport parameters, schemas, service metadata, declared errors, and response mappings rather than inspecting the live HTTP framework.

#### Scenario: Route contract is generated

- **WHEN** a valid service-member route is compiled
- **THEN** its OpenAPI operation describes the same method, path parameters, query/header values, request body, success response, validation response, and declared errors enforced at runtime and includes the service tag used by Scalar

## ADDED Requirements

### Requirement: HTTP request parameters are immutable transport data

An HTTP-triggered function SHALL receive immutable parameter, query, and header collections derived from the matched request, in addition to the existing framework-neutral method, URL, body, clone, and body-reader surface.

#### Scenario: Nested parameter route is invoked

- **WHEN** `/orders/:orderId/products/:productId` matches a request
- **THEN** `request.params` contains separate `orderId` and `productId` values and no framework-specific context is exposed

#### Scenario: Handler attempts request mutation

- **WHEN** application code attempts to replace or mutate parameter, query, or header collections
- **THEN** the public type contract and runtime immutability prevent the change from affecting the active request or another handler

### Requirement: Next-style dynamic names are unambiguous

A single route path SHALL NOT repeat a dynamic parameter name, and different dynamic values in one path SHALL use distinct names that remain stable across runtime matching, input mapping, OpenAPI, and generated clients.

#### Scenario: Dynamic name repeats

- **WHEN** a route resolves to `/orders/:id/products/:id`
- **THEN** compilation rejects it with a source-located duplicate-parameter diagnostic

#### Scenario: Dynamic names are distinct

- **WHEN** a route resolves to `/orders/:orderId/products/:productId`
- **THEN** compilation, runtime matching, OpenAPI, and the generated client preserve both names

### Requirement: HTTP exposes retry delay without retrying requests

When an HTTP route maps a retryable declared error with `afterMs`, the response SHALL expose a standards-compatible `Retry-After` minimum delay while the HTTP runtime SHALL NOT automatically repeat the function invocation.

#### Scenario: Retryable HTTP error is returned

- **WHEN** a route target throws a mapped retryable error with `afterMs: 1500`
- **THEN** the response includes `Retry-After` rounded up to whole seconds, the handler ran once, and the client decides whether to make another request

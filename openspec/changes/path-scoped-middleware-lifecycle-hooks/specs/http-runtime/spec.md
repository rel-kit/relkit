## MODIFIED Requirements

### Requirement: Graph-driven HTTP materialization

The HTTP runtime SHALL create its route table from planned HTTP trigger nodes, register discovered path-scoped middleware before routes in canonical middleware-ID order, and keep the HTTP framework context inside the route layer.

#### Scenario: Route starts successfully

- **WHEN** a valid HTTP trigger targets a registered function
- **THEN** the runtime registers the method/path and invokes that function through the common engine with source `http`

#### Scenario: Matching middleware continues

- **WHEN** path-scoped middleware matches a request and awaits its continuation
- **THEN** the next matching middleware or route runs with standard onion ordering

#### Scenario: Matching middleware responds

- **WHEN** path-scoped middleware returns a response without continuing
- **THEN** later middleware, request mapping, and the route target do not run

### Requirement: Serializable request mapping execution

The runtime SHALL execute the compiled mapping model after route middleware continuation for path, query, header, cookie, JSON body, whole body, multipart, constants, nested objects, optional/default values, Hono validated values, and named transforms, and SHALL enforce content type, body size, parsing, and target input validation before function invocation.

#### Scenario: Valid mapped request arrives

- **WHEN** request values satisfy the route mapping and target function schema
- **THEN** the target receives exactly the mapped reusable input and no transport request argument

#### Scenario: Middleware supplies validated data

- **WHEN** matching middleware changes Hono validated parameter, query, header, cookie, JSON, or form data before continuing
- **THEN** route mapping uses the validated value in preference to the corresponding raw request value

#### Scenario: Matching path field is inferred

- **WHEN** `/orders/:orderId` targets a function whose input contains `orderId`
- **THEN** inference maps the path value into that input field and OpenAPI describes it as a path parameter rather than request-body data

#### Scenario: Path field is not part of business input

- **WHEN** a path parameter has no matching target-input property
- **THEN** compilation does not require an artificial function input field and request-only behavior may inspect it in route middleware

#### Scenario: Named transform executes

- **WHEN** a mapping references a declared transform ID
- **THEN** the runtime resolves the hash-matched manifest validator, applies it before target admission, and reports a safe validation failure without calling the target when it fails

#### Scenario: Malformed body arrives

- **WHEN** JSON is malformed, content type is wrong, the body is too large, or mapped values fail validation
- **THEN** the runtime returns the declared safe validation response, records the failure, and does not call the function

## ADDED Requirements

### Requirement: Path-scoped middleware matching

Middleware paths SHALL support global `*`, static segments, named `:param` segments, and a trailing `*`, and unsupported patterns SHALL fail authoring or compilation.

#### Scenario: Middleware path covers a route

- **WHEN** a middleware pattern covers every runtime path represented by a route
- **THEN** the compiled relationship is classified as `always`

#### Scenario: Middleware partially covers a catch-all route

- **WHEN** a middleware pattern covers only some runtime paths represented by a catch-all route
- **THEN** runtime matching remains request-specific and the compiled relationship is classified as `conditional`

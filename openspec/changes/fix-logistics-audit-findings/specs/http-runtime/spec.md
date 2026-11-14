## ADDED Requirements

### Requirement: Early responses keep the connection usable

When the server answers before the request body has been read (origin denial, body limit, unknown route, method not allowed, route-level authentication, not ready), it SHALL either consume the remaining body up to the configured body limit or close the connection, so that the next request on the same connection is parsed correctly. The development proxy SHALL NOT reuse an upstream connection whose request body was not fully sent.

#### Scenario: A rejected upload is followed by a valid request

- **WHEN** a client sends a cross-origin `POST` with a body, receives 403, and sends a valid request on the same connection
- **THEN** the second request receives its normal response with a request ID

#### Scenario: The unread body exceeds the limit

- **WHEN** the unread body is larger than the configured body limit
- **THEN** the response carries `Connection: close` and the connection is closed after the response

### Requirement: Started builds run in production mode

`relkit start` SHALL run the built server in production mode unless the operator sets the RelKit environment explicitly. Development-only behaviour (open inspection probes, API documentation, failure detail) SHALL NOT depend on the operator remembering to set `NODE_ENV`.

#### Scenario: Start without NODE_ENV

- **WHEN** a built application is started with `relkit start` and neither `RELKIT_ENV` nor `NODE_ENV` is set
- **THEN** the server reports production mode and the development-only endpoints are absent

### Requirement: The activation probe carries identity only

The core graph probe on the application listener SHALL return only the hashes and versions that activation needs. Functions, routes, source paths, permission names and environment variable names SHALL be available only through the authenticated development bridge.

#### Scenario: Unauthenticated graph request on the application port

- **WHEN** a caller without inspection credentials requests the core graph probe
- **THEN** the response contains hashes and versions and no source path, permission name or environment variable name

### Requirement: Internal failures stay out of the response

A 500 response SHALL carry a generic detail in every mode. The redacted cause SHALL be written to the error log and to the request's telemetry with the request ID and trace ID.

#### Scenario: A database driver error

- **WHEN** a handler fails with a provider error whose message contains a query and its parameters
- **THEN** the response detail is generic, and the error log has one record with the redacted cause, the request ID and the trace ID

### Requirement: Body limit applies to every route

The configured body limit SHALL be enforced on the bytes read, with or without a `Content-Length` header, for application routes and for mounted handlers such as Better Auth. An oversize body SHALL produce the same status in development and in production.

#### Scenario: Chunked oversize body on a mounted handler

- **WHEN** a body larger than the limit is sent without `Content-Length` to a mounted authentication route
- **THEN** the request is rejected with the oversize status and the handler does not receive the body

### Requirement: JSON bodies are decoded strictly

Coercion of strings to numbers and booleans SHALL apply only to values taken from the path, query, headers and cookies. A JSON body SHALL be validated as sent, and a body that is not a JSON object SHALL be rejected when the route maps body fields.

#### Scenario: Numeric string for an integer body field

- **WHEN** a JSON body carries `"3500"` for a field the contract declares as integer
- **THEN** the response is the validation error naming that field

#### Scenario: Non-object body

- **WHEN** a route that maps body fields receives `null`, an array or a string as its JSON body
- **THEN** the response is a validation error with an issue saying the body must be an object

### Requirement: Method semantics for HEAD and OPTIONS

A `HEAD` response SHALL carry the `Content-Length` of the corresponding `GET`. An `OPTIONS` request SHALL be treated as a cross-origin preflight only when it carries `Access-Control-Request-Method`; otherwise it SHALL answer with the allowed methods.

#### Scenario: OPTIONS from the same origin without a requested method

- **WHEN** `OPTIONS` arrives with a same-origin `Origin` and no `Access-Control-Request-Method`
- **THEN** the response lists the allowed methods and is not an origin denial

### Requirement: Request identity on every response

Every response from the application listener, including control-plane and proxy-generated responses, SHALL carry `x-request-id`, and every Problem Details body SHALL carry that request ID next to the trace ID. Errors produced by the development proxy and by internal endpoints SHALL be Problem Details.

#### Scenario: Unknown control-plane path in development

- **WHEN** a client requests an unknown path under the versioned internal prefix
- **THEN** the response is Problem Details with `x-request-id`

### Requirement: Safe default response headers

JSON and Problem Details responses from application routes SHALL carry `X-Content-Type-Options: nosniff` and `Cache-Control: no-store` unless the route declares its own caching.

#### Scenario: Authenticated list response

- **WHEN** an authenticated route returns JSON without a declared cache policy
- **THEN** the response carries both headers

### Requirement: Contract lists the statuses the server sends

The generated OpenAPI document SHALL declare, for each operation, the authentication, authorization, validation, oversize and internal-error responses the runtime can send for it.

#### Scenario: Protected route with input

- **WHEN** an operation has an access rule and a request body
- **THEN** its responses include 401, 403, the validation status, the oversize status and 500

### Requirement: Realtime precondition failures keep their status

A realtime subscription whose identity precondition fails SHALL answer with the declared conflict status before any stream is opened.

#### Scenario: Stale identity scope

- **WHEN** a subscription request carries an identity scope that does not match the session
- **THEN** the response status is 409 with the precondition code

## MODIFIED Requirements

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

- **WHEN** JSON is malformed, content type is wrong, or mapped values fail validation
- **THEN** the runtime returns the declared safe validation response, records the failure, and does not call the function

#### Scenario: Body is too large

- **WHEN** the request body is larger than the body limit that applies to the route
- **THEN** the runtime answers `413` with code `body-too-large`, records the failure, and does not call the function

### Requirement: Route body and file limits

The HTTP runtime SHALL enforce the route-specific body limit or configured server default on the bytes read, with or without a declared `Content-Length`, before unbounded parsing, then SHALL validate individual file byte/media-type constraints and repeated multipart fields before target invocation.

#### Scenario: Body exceeds its route limit

- **WHEN** request bytes exceed `maxBodyBytes`, whether the length is declared or the body is streamed, in development or in production
- **THEN** the runtime answers `413` with code `body-too-large`, records the failure, and does not parse or invoke the target

#### Scenario: Repeated multipart field is valid

- **WHEN** a repeated multipart mapping receives several valid values
- **THEN** the target receives them in request order as a validated array

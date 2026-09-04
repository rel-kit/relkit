## Purpose

Defines observable HTTP routing, request/response conversion, internal endpoints, OpenAPI generation, and typed client behavior derived from the application graph.
## Requirements
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

### Requirement: Deterministic route precedence and collision rejection

Routes SHALL be ordered by exact static path, dynamic path, required catch-all path, optional catch-all path, and stable registration ID tie-breaker, and duplicate normalized method/runtime-path pairs SHALL fail compilation before startup.

#### Scenario: Static and parameter routes overlap

- **WHEN** `/orders/new` and `/orders/:id` both match an incoming path
- **THEN** the exact static route is selected deterministically

#### Scenario: Catch-all routes overlap

- **WHEN** dynamic, required catch-all, and optional catch-all variants can all match a path
- **THEN** the most specific route is selected using the documented precedence

#### Scenario: Normalized collision exists

- **WHEN** two routes produce the same HTTP method and normalized runtime path
- **THEN** compilation emits `RELKIT_ROUTE_COLLISION` and no server generation becomes activatable

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

### Requirement: Path-scoped middleware matching

Middleware paths SHALL support global `*`, static segments, named `:param` segments, and a trailing `*`, and unsupported patterns SHALL fail authoring or compilation.

#### Scenario: Middleware path covers a route

- **WHEN** a middleware pattern covers every runtime path represented by a route
- **THEN** the compiled relationship is classified as `always`

#### Scenario: Middleware partially covers a catch-all route

- **WHEN** a middleware pattern covers only some runtime paths represented by a catch-all route
- **THEN** runtime matching remains request-specific and the compiled relationship is classified as `conditional`

### Requirement: Declared response mapping

The HTTP runtime SHALL convert successful values, declared application errors, validation failures, rate limits, timeouts, cancellation, and unexpected defects using inferred route responses or complete explicit response declarations, and SHALL validate response bodies in development and test.

#### Scenario: Successful value is inferred

- **WHEN** a route without explicit responses returns a non-void target value
- **THEN** the runtime returns validated JSON with status `200` unless `successStatus` overrides it

#### Scenario: Void value is inferred

- **WHEN** a route without explicit responses returns void or undefined
- **THEN** the runtime returns `204` with no body

#### Scenario: Declared error maps to HTTP

- **WHEN** a target function throws a declared HTTP error
- **THEN** its configured status and safe error envelope are returned and the request outcome is `declared-error`

#### Scenario: Unexpected defect occurs

- **WHEN** the target produces an unexpected defect
- **THEN** the client receives a generic safe server response while correlated diagnostic detail remains internal

#### Scenario: HEAD route succeeds

- **WHEN** a `HEAD` route produces a normal successful response
- **THEN** status and headers are preserved while the response body is removed

### Requirement: Request lifecycle propagation

Every inbound application request SHALL receive a fresh local request ID and origin request ID, accept only valid W3C parent context, ignore incoming request/origin identity headers, and return x-request-id without x-trace-id. Correlation ID SHALL remain application-defined. One outermost server span SHALL cover HTTP arrival through runtime-observable response-body termination across generated host and nested routing integrations.

#### Scenario: Client disconnects

- **WHEN** a connected client closes before the response completes
- **THEN** the function signal is aborted and the request completes exactly once as cancelled

#### Scenario: Remote parent is supplied

- **WHEN** a request supplies valid traceparent and arbitrary request identity headers
- **THEN** the server span has the remote trace parent, fresh local request identity and no inferred business correlation ID

### Requirement: Versioned internal endpoints

The backend SHALL expose versioned liveness, readiness, graph, request, log, trace, stream, and diagnostics endpoints under `/_relkit/v1`, and SHALL disable or protect them in production according to deployment configuration.

#### Scenario: Readiness is queried during startup

- **WHEN** required providers or registrations are not ready
- **THEN** liveness can succeed while readiness reports non-ready without exposing secrets

#### Scenario: Production protection is absent

- **WHEN** a production configuration would expose unprotected internal endpoints
- **THEN** startup or deployment validation rejects the configuration

### Requirement: OpenAPI 3.1 from contracts

The system SHALL generate deterministic OpenAPI 3.1 from route trigger metadata, structured transport parameters, schemas, service metadata, declared errors, and response mappings rather than inspecting the live HTTP framework.

#### Scenario: Route contract is generated

- **WHEN** a valid service-member route is compiled
- **THEN** its OpenAPI operation describes the same method, path parameters, query/header values, request body, success response, validation response, and declared errors enforced at runtime and includes the service tag used by Scalar

### Requirement: Generated typed HTTP client

The compiler SHALL generate a deterministic TypeScript client whose inputs and success/error outcomes follow the graph/OpenAPI route contracts, encode catch-all segments independently, and contain no dependency on runtime internals.

#### Scenario: Client calls a declared route

- **WHEN** application code uses a generated client method with valid input
- **THEN** TypeScript infers the route input and typed status/result union

#### Scenario: Client calls an optional catch-all route

- **WHEN** a client call omits or supplies the optional segment array
- **THEN** it requests the correct concrete path with each supplied segment safely encoded

### Requirement: HTTP test surfaces

The testing package SHALL provide in-memory HTTP requests for ordinary integration tests and a real Bun listener path for disconnect, streaming, and supervisor proxy behavior.

#### Scenario: Route integration test runs

- **WHEN** a test sends an in-memory request to a test application
- **THEN** it can assert status/body plus correlated request, log, trace, and fake-provider effects without binding a port

### Requirement: Route body and file limits

The HTTP runtime SHALL enforce the route-specific body limit or configured server default before unbounded parsing, then SHALL validate individual file byte/media-type constraints and repeated multipart fields before target invocation.

#### Scenario: Body exceeds its route limit

- **WHEN** request bytes exceed `maxBodyBytes`
- **THEN** the runtime returns a bounded safe validation response, records the failure, and does not parse or invoke the target

#### Scenario: Repeated multipart field is valid

- **WHEN** a repeated multipart mapping receives several valid values
- **THEN** the target receives them in request order as a validated array

### Requirement: Route rate-limit enforcement

The HTTP runtime SHALL enforce route rate limits after framework request setup and before authored middleware, mapping, body parsing, and target invocation, using an isolated key/window counter and emitting safe standard headers and telemetry.

#### Scenario: Limit is exceeded

- **WHEN** one derived key exceeds the route limit during its window
- **THEN** the runtime returns `429` with retry/rate-limit headers and invokes neither middleware nor target

#### Scenario: Shared store is used

- **WHEN** two production runtime instances use the same configured cache store
- **THEN** they enforce one shared counter contract rather than independent process-local limits

### Requirement: Runtime OpenAPI and API reference

The backend SHALL serve its active deterministic OpenAPI document and an interactive API reference under versioned internal endpoints in development, and SHALL require explicit protected production opt-in.

#### Scenario: Developer opens the API reference

- **WHEN** a valid development generation is active
- **THEN** the reference renders the same OpenAPI contract enforced by that generation

#### Scenario: Production opt-in lacks protection

- **WHEN** production enables API documentation without internal-endpoint authorization
- **THEN** startup or deployment validation rejects the configuration

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

### Requirement: Better Auth protection precedes authored route middleware
The HTTP runtime SHALL register declarative Better Auth session protection before authored route middleware, exclude auth endpoint paths, and reuse one memoized session lookup through route middleware and function invocation context.

#### Scenario: Protected request has no session
- **WHEN** a protected application path is requested without a session
- **THEN** the standard unauthorized response is returned and authored route middleware and the target function do not run

### Requirement: Application traffic follows complete readiness
Liveness SHALL remain available during startup, while readiness and non-internal application traffic SHALL remain unavailable until environment, providers, Drizzle, and Better Auth have completed activation.

#### Scenario: Request arrives during auth startup
- **WHEN** an application request arrives before Better Auth activation completes
- **THEN** the runtime returns a not-ready response rather than invoking a raw or function route

### Requirement: Complete HTTP boundary coverage

Raw/compiled routes, RPC, MCP, static files, startup/draining rejection, auth/limits and unmatched application requests SHALL be observed. Requests under the reserved `/_relkit` control-plane prefix, telemetry ingestion and exporter transport SHALL be excluded from application request, span and log recording. Application work initiated by an Inspector action SHALL remain observable at its function, job, event, tool or resource boundary. Middleware SHALL be inclusive child spans. Arrival, route match, mapping, validation, hooks, headers and terminal markers SHALL describe only executed stages.

#### Scenario: Middleware short circuits

- **WHEN** middleware returns without invoking its continuation
- **THEN** its inclusive span and HTTP outcome are shown without fabricated route/handler stages

#### Scenario: Inspector reads runtime metadata

- **WHEN** Inspector repeatedly reads health, graph, descriptor, runtime, API documentation or telemetry endpoints
- **THEN** those control-plane requests add no application request, span or log records

#### Scenario: Inspector initiates application work

- **WHEN** an Inspector action invokes a function or controls asynchronous work
- **THEN** the control-plane HTTP wrapper is omitted while the resulting application operation remains observable

### Requirement: Response lifecycle preserves semantics

HEAD and bodyless responses SHALL complete immediately. Other responses SHALL complete once on body EOF, error, cancellation, abort or shutdown without changing backpressure, bytes, headers, status or cancellation semantics. HTTP completion SHALL NOT wait for asynchronous event/job work.

#### Scenario: Streaming response pauses

- **WHEN** a response body remains open after headers
- **THEN** the request remains active until its observed body terminates, without claiming proof of remote socket delivery

### Requirement: Server RELKIT client propagation

Server-side RELKIT client calls SHALL create client spans, inject W3C headers from the active span, and finish on headers or failure without consuming the body. Browser/default client exports SHALL remain free of server runtime imports.

#### Scenario: Client is reused across requests

- **WHEN** a cached client is called under two concurrent parent spans
- **THEN** each request propagates its own current parent and global fetch is unchanged

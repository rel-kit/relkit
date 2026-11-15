## MODIFIED Requirements

### Requirement: Request identity on every response

Every response that RelKit's code writes from the application listener, including control-plane responses, proxy-generated responses and the development front's live update stream, SHALL carry `x-request-id`, and every Problem Details body SHALL carry that request ID next to the trace ID. Errors produced by the development proxy and by internal endpoints SHALL be Problem Details. An answer the runtime's HTTP server writes before RelKit's code sees the request SHALL be documented as a server-level answer, with the runtimes on which it carries no request ID.

#### Scenario: Unknown control-plane path in development

- **WHEN** a client requests an unknown path under the versioned internal prefix
- **THEN** the response is Problem Details with `x-request-id`

#### Scenario: Live update stream in development

- **WHEN** a client opens the client contract's live update stream on the development port
- **THEN** the response carries `x-request-id`, and a second stream carries a different value

#### Scenario: Header fields too large on Node

- **WHEN** a request whose headers exceed the server's limit reaches a Node listener
- **THEN** the answer is 431 with `x-request-id` and `Connection: close`

#### Scenario: Header fields too large on Bun

- **WHEN** a request whose headers exceed the server's limit reaches a Bun listener
- **THEN** the runtime answers 431 before RelKit's code runs, and the documentation names this answer as one without a request ID on Bun

### Requirement: Method semantics for HEAD and OPTIONS

A `HEAD` response SHALL carry the `Content-Length` of the corresponding `GET`. An `OPTIONS` request SHALL be treated as a cross-origin preflight only when it carries `Access-Control-Request-Method`; otherwise it SHALL answer with the allowed methods. The generated OpenAPI document SHALL state these two answers once in its description and SHALL NOT generate a `HEAD` or `OPTIONS` operation for a route that does not declare one.

#### Scenario: OPTIONS from the same origin without a requested method

- **WHEN** `OPTIONS` arrives with a same-origin `Origin` and no `Access-Control-Request-Method`
- **THEN** the response lists the allowed methods and is not an origin denial

#### Scenario: Document of an application with a GET route

- **WHEN** the OpenAPI document of an application with a `GET` route is generated
- **THEN** its description says that the route also answers `HEAD` and that `OPTIONS` answers 204 with `Allow`, and the path lists no `head` or `options` operation

### Requirement: Contract lists the statuses the server sends

The generated OpenAPI document SHALL declare, for each operation, the authentication, authorization, validation, oversize and internal-error responses the runtime can send for it. A status the HTTP server sends before a route is chosen, such as 431, SHALL be stated in the document's description and SHALL NOT be listed on each operation.

#### Scenario: Protected route with input

- **WHEN** an operation has an access rule and a request body
- **THEN** its responses include 401, 403, the validation status, the oversize status and 500

#### Scenario: Request header fields too large

- **WHEN** the OpenAPI document is generated
- **THEN** its description says that 431 is answered before a route is chosen, and no operation lists 431

## ADDED Requirements

### Requirement: Authentication operations declare the format Better Auth sends

Errors from a mounted Better Auth service SHALL keep Better Auth's own JSON format. The served OpenAPI document SHALL declare that format for the service's operations through one shared schema, SHALL list Problem Details beside it for a status RelKit answers before Better Auth runs, and SHALL say in its description that these operations do not answer errors as Problem Details.

#### Scenario: Error response of an authentication operation

- **WHEN** the served document describes a 4xx or 5xx JSON response of a Better Auth operation
- **THEN** the response refers to a schema with a required `message` and optional `code` and `issues`

#### Scenario: A real error validates against the declaration

- **WHEN** a Better Auth endpoint answers a failed sign-in, an unknown organization or a missing field
- **THEN** the body validates against the schema declared for that status

#### Scenario: Cross-origin request to a state-changing authentication operation

- **WHEN** the served document describes the 403 of a `POST` authentication operation
- **THEN** it lists `application/json` for Better Auth's refusal and `application/problem+json` for the transport policy's refusal

### Requirement: The served document lists only authentication operations the service serves

The served OpenAPI document SHALL list a Better Auth operation only when the configured service routes it and can answer it with a status other than 405. An operation the service serves SHALL be listed whether or not the application calls it.

#### Scenario: Session refresh by POST is off

- **WHEN** the Better Auth configuration does not enable `session.deferSessionRefresh`
- **THEN** the served document lists `GET` but not `POST` for the session endpoint

#### Scenario: Every documented operation is routed

- **WHEN** each Better Auth operation of the document is sent to the service once
- **THEN** none is answered by the router's not-found response

#### Scenario: A plugin is not enabled

- **WHEN** the Better Auth configuration has no organization plugin
- **THEN** the served document lists no organization operation

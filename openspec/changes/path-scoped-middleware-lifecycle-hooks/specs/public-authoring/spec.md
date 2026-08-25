## MODIFIED Requirements

### Requirement: Function-only authored execution

Functions SHALL be the only authored descriptors that own business handlers; path-scoped route middleware MAY own HTTP handlers, routes, jobs, schedules, event listeners, tools, and service members SHALL target function references, services SHALL group functions and invocation policy, and agents SHALL compile to generated internal function identities.

#### Scenario: Non-function business handler is declared

- **WHEN** application code attempts to put a business handler on a route, job, event-trigger, tool, or service descriptor
- **THEN** the public type contract or descriptor validation rejects it

#### Scenario: Route middleware is declared

- **WHEN** application code calls `defineMiddleware(path, handler)`
- **THEN** it receives a stable middleware descriptor whose handler receives an HTTP context, continuation, and base ZSYS execution context without targeting a function

#### Scenario: Function invokes another function

- **WHEN** a handler calls `target.invoke(input)`
- **THEN** no parallel function dependency declaration or `context.functions` client is required

#### Scenario: Managed dependency is declared

- **WHEN** a function declares a job, event, bucket, cache, or agent dependency
- **THEN** its handler and lifecycle hooks expose only the correspondingly named and typed Promise-based clients

### Requirement: Complete v3 descriptor surface

The public authoring API SHALL support application, function, declared error, route, path-scoped middleware, job/schedule, event, event-trigger, bucket, cache, tool, and agent descriptors with the fields and constraints defined by the approved v3 baseline.

#### Scenario: Full fixture is authored

- **WHEN** the commerce fixture declares every in-scope concept through public packages
- **THEN** business behavior remains in functions, HTTP gate behavior remains in route middleware, and application code performs no direct runtime registration

## ADDED Requirements

### Requirement: Transport-independent function lifecycle

Function handlers and their optional `onBefore` and `onAfter` hooks SHALL receive typed values and execution context without an HTTP request argument.

#### Scenario: Function is invoked from different transports

- **WHEN** the same function is invoked directly, over HTTP, by a job, event, tool, or agent
- **THEN** its handler and hooks have identical signatures and receive transport data only when explicitly mapped into function input

#### Scenario: Function hooks transform values

- **WHEN** `onBefore` returns input or `onAfter` returns successful output
- **THEN** the returned value becomes the validated value for the next lifecycle stage

## REMOVED Requirements

### Requirement: Structured transport request is separate from invocation input

**Reason**: HTTP request access belongs to path-scoped route middleware and made reusable functions transport-aware.

**Migration**: Map required HTTP values into the route target input or handle request-only behavior in route middleware; update handlers from `(input, request, context)` to `(input, context)`.

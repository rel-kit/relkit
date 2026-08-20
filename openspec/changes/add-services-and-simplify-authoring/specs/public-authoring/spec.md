## MODIFIED Requirements

### Requirement: Function-only authored execution

Functions SHALL be the only authored descriptors that own business handlers; routes, route middleware declarations, jobs, schedules, event listeners, tools, and service members SHALL target function references, services SHALL group functions and invocation policy, and agents SHALL compile to generated internal function identities.

#### Scenario: Non-function handler is declared

- **WHEN** application code attempts to put a business handler on a route, job, event-trigger, tool, or service descriptor
- **THEN** the public type contract or descriptor validation rejects it

#### Scenario: Route middleware is declared

- **WHEN** application code creates middleware metadata for a route
- **THEN** it receives a stable `MiddlewareRef` that targets a normal function through serializable request/decision mappings, constrains any short-circuit to a schema-compatible route-declared response, and exposes neither a middleware handler nor an HTTP-framework context

#### Scenario: Function invokes another function

- **WHEN** a handler calls `target.invoke(input)`
- **THEN** no parallel function dependency declaration or `context.functions` client is required

#### Scenario: Managed dependency is declared

- **WHEN** a function declares a job, event, bucket, cache, or agent dependency
- **THEN** its handler context exposes only the correspondingly named and typed Promise-based clients

### Requirement: Stable immutable descriptors

Every compiled application descriptor SHALL have a stable ID, kind, global descriptor brand, typed reference, serializable declaration metadata, and development/test immutability; application, event, job, bucket, and cache IDs SHALL be explicit, while function, route, service, tool, agent, error, middleware, and transform IDs MAY be deterministically inferred from source hierarchy when omitted.

#### Scenario: Descriptor is mutated in development

- **WHEN** application code attempts to mutate a descriptor after creation
- **THEN** the mutation fails rather than silently changing compilation behavior

#### Scenario: Explicitly identified descriptor source moves

- **WHEN** a descriptor with an explicit ID moves to another source path without changing its ID or contract
- **THEN** its logical graph and deployment identity remain unchanged apart from source-location metadata

#### Scenario: Inferred descriptor source moves

- **WHEN** a descriptor with an inferred ID moves to a different identity-bearing hierarchy
- **THEN** compilation deterministically derives the new ID and compatibility output reports the logical identity change

#### Scenario: Inferred identities collide

- **WHEN** two descriptors derive the same stable ID
- **THEN** compilation fails with a collision diagnostic identifying both source bindings and suggests an explicit override

### Requirement: Declared public errors

Applications SHALL be able to declare typed errors with optional source-inferred IDs, validated safe data, messages, HTTP mappings, and optional retry metadata, and handlers SHALL throw instances created by those declarations; omitted retry metadata SHALL mean non-retryable.

#### Scenario: Declared error is thrown

- **WHEN** a handler throws an error instance created from a declared error descriptor
- **THEN** the runtime can distinguish and safely expose the declared failure from provider failures, cancellation, timeouts, and unexpected defects

#### Scenario: Error identity is omitted

- **WHEN** a statically identifiable binding such as `const InvalidError = defineError(...)` omits `id`
- **THEN** the compiler derives a filesystem-safe ID from its source hierarchy and binding name while preserving an explicit ID override

#### Scenario: Retry metadata is omitted

- **WHEN** a declared error does not specify `retry`
- **THEN** its normalized retry classification is `never`

#### Scenario: Retry delay is declared

- **WHEN** retry metadata is `later` or contains `{ kind: "later", afterMs }`
- **THEN** the descriptor records a retryable classification and validates any `afterMs` as a finite non-negative millisecond delay

### Requirement: Ordinary application libraries remain opaque

Application developers SHALL remain free to call ordinary libraries from function handlers, and ZSys SHALL NOT infer or add those libraries' persistence, identity, workflow, knowledge, or other internal concepts to the application graph.

#### Scenario: Function uses an ordinary library

- **WHEN** a function imports and calls a non-ZSys database or HTTP client library
- **THEN** ZSys models only authored ZSys descriptors, explicitly declared managed resources, and observed ZSys descriptor calls, not the library's internal resources or behavior

## ADDED Requirements

### Requirement: Structured transport request is separate from invocation input

Function handlers SHALL receive reusable validated invocation input separately from an optional immutable framework-neutral request containing transport-derived parameters, query values, headers, method, URL, body access, and request metadata.

#### Scenario: HTTP route invokes a function

- **WHEN** a route maps `request.params.orderId` to a matching business input field
- **THEN** the handler receives validated `{ orderId }` input and can independently inspect the immutable request parameters without treating them as body fields

#### Scenario: Non-HTTP source invokes a function

- **WHEN** a function is invoked directly, by a job, event, tool, or agent without an HTTP transport
- **THEN** its business input remains available and its request argument is absent rather than a fabricated HTTP request

### Requirement: Functions expose invocation and tool views

A function descriptor SHALL expose typed Promise-based `invoke(input)` and `asTool(options?)` operations without exposing internal engine types or duplicating the function handler.

#### Scenario: Function is invoked from ordinary application code

- **WHEN** application code awaits `getOrder.invoke({ orderId })`
- **THEN** TypeScript infers the function input and output and the call enters the common ZSYS invocation boundary

#### Scenario: Function becomes a tool

- **WHEN** `getOrder.asTool(...)` is declared
- **THEN** the resulting tool inherits the function schemas, errors, and handler target while adding only tool metadata


## Purpose

Defines the plain-TypeScript application authoring surface, portable contracts, descriptor semantics, conventions, and global provider selection visible to RelKit developers.

## Requirements

### Requirement: Plain TypeScript public boundary

Application developers SHALL author normal synchronous or asynchronous TypeScript handlers and Standard Schema-compatible contracts without importing or returning Effect, Hono, Next.js, Pulumi, cloud SDK, or provider-client types.

#### Scenario: Public declaration inspection

- **WHEN** the public packages and generated application declarations are emitted and scanned
- **THEN** no internal framework type appears in an application-facing signature

### Requirement: Function-only authored execution

Functions SHALL be the only authored descriptors that own business handlers; path-scoped route middleware MAY own HTTP handlers, routes, jobs, schedules, event listeners, tools, and service members SHALL target function references, services SHALL group functions and invocation policy, and agents SHALL compile to generated internal function identities.

#### Scenario: Non-function handler is declared

- **WHEN** application code attempts to put a business handler on a route, job, event-trigger, tool, or service descriptor
- **THEN** the public type contract or descriptor validation rejects it

#### Scenario: Route middleware is declared

- **WHEN** application code calls `defineMiddleware(path, handler)`
- **THEN** it receives a stable middleware descriptor whose handler receives an HTTP context, continuation, and base RELKIT execution context without targeting a function

#### Scenario: Function invokes another function

- **WHEN** a handler calls `target.invoke(input)`
- **THEN** no parallel function dependency declaration or `context.functions` client is required

#### Scenario: Managed dependency is declared

- **WHEN** a function declares a job, event, bucket, cache, or agent dependency
- **THEN** its handler and lifecycle hooks expose only the correspondingly named and typed Promise-based clients

### Requirement: Standard Schema validation and projection

RelKit SHALL provide `@relkit/schema` with a familiar `z` builder and SHALL accept other Standard Schema-compatible schemas when validation and deterministic JSON Schema projection are available.

#### Scenario: Supported schema validates

- **WHEN** a sync or async compatible schema receives an unknown value
- **THEN** validation returns a typed value or structured issues with stable paths

#### Scenario: JSON Schema is unavailable

- **WHEN** a third-party Standard Schema cannot supply or support the JSON Schema needed for graph/OpenAPI generation
- **THEN** compilation fails with `RELKIT_SCHEMA_UNAVAILABLE` and a useful source location

### Requirement: Value-free environment contracts

Environment declarations SHALL produce static resolved types, runtime parsing rules, defaults, optional environment-specific requirements, descriptions, examples, sensitivity metadata, and JSON-safe graph projections without resolving process or file values during descriptor evaluation. Applications SHALL declare one schema whose keys receive pipeline-specific values, and SHALL NOT declare the framework-reserved `RELKIT_ENV` key.

#### Scenario: Secret environment variable is compiled

- **WHEN** an environment descriptor includes a secret variable
- **THEN** graph metadata records its name, type, requirement/default presence, and sensitivity but never its value

#### Scenario: Runtime environment is invalid

- **WHEN** a runtime generation resolves a missing or malformed required value
- **THEN** readiness fails before provider construction or traffic activation and identifies the variable without revealing secret content

#### Scenario: Identical keys receive pipeline-specific values

- **WHEN** local and production pipelines launch the same application topology with different endpoint and credential values
- **THEN** both value sets are validated against the same environment schema without provider branches

#### Scenario: Application declares the reserved runtime key

- **WHEN** an application environment schema declares `RELKIT_ENV`
- **THEN** authoring or compilation rejects it as framework-reserved

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

### Requirement: Transport-independent function lifecycle

Function handlers and their optional `onBefore` and `onAfter` hooks SHALL receive typed values and execution context without an HTTP request argument.

#### Scenario: Function is invoked from different transports

- **WHEN** the same function is invoked directly, over HTTP, by a job, event, tool, or agent
- **THEN** its handler and hooks have identical signatures and receive transport data only when explicitly mapped into function input

#### Scenario: Function hooks transform values

- **WHEN** `onBefore` returns input or `onAfter` returns successful output
- **THEN** the returned value becomes the validated value for the next lifecycle stage

### Requirement: Serializable route and selector DSLs

HTTP request/response mappings SHALL be declarative and serializable, SHALL preserve type relationships to their target functions, and SHALL reject arbitrary executable mapping closures; business event functions SHALL name one exact generated-registry event rather than expose a selector DSL.

#### Scenario: Route mapping is projected

- **WHEN** a route maps path, query, header, cookie, JSON body, multipart, constant, nested, optional, default, or named-transform values
- **THEN** the mapping can be serialized into the graph and checked against the target input

#### Scenario: Named transform is declared

- **WHEN** a route binds a stable transform ID to a Standard Schema-compatible validator/transform
- **THEN** the graph contains only the ID and deterministic schema projection while the executable validator is resolved through the hash-matched runtime manifest

#### Scenario: Event selector combines known events

- **WHEN** `defineEventFunction` names a known event ID
- **THEN** its input is inferred from that exact event and no wildcard or multi-event selector is authored

### Requirement: Conventions warn without excluding descriptors

Recommended directories, suffixes, grouping, and ID style SHALL continue to produce non-fatal diagnostics for branded descriptors, except that HTTP routes SHALL use the required `src/routes/**/route.ts` named-method convention because the source path defines their public URL and method.

#### Scenario: Valid non-route descriptor uses the wrong path

- **WHEN** a branded bucket descriptor is exported outside `src/buckets/**/*.bucket.ts`
- **THEN** compilation includes it and emits a convention warning without a non-zero exit solely for that warning

#### Scenario: Route uses the wrong path

- **WHEN** a route descriptor is exported outside `src/routes/**/route.ts`
- **THEN** compilation rejects it with a migration diagnostic because its method/path cannot be derived from the required convention

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

Application developers SHALL remain free to call ordinary libraries from function handlers, and RelKit SHALL NOT infer or add those libraries' persistence, identity, workflow, knowledge, or other internal concepts to the application graph.

#### Scenario: Function uses an ordinary library

- **WHEN** a function imports and calls a non-RelKit database or HTTP client library
- **THEN** RelKit models only authored RelKit descriptors, explicitly declared managed resources, and observed RelKit descriptor calls, not the library's internal resources or behavior

### Requirement: File-system route authoring

Application HTTP routes SHALL be exported as named HTTP methods from `src/routes/**/route.ts`, SHALL derive their path and method from source structure, SHALL retain explicit stable route IDs, and SHALL allow multiple methods in one file.

#### Scenario: Multi-method route file is authored

- **WHEN** one `route.ts` exports `GET` and `PATCH` route descriptors
- **THEN** both descriptors use the file-derived path, preserve their explicit IDs, and compile as distinct method/path operations

#### Scenario: Dynamic and catch-all segments are authored

- **WHEN** route files contain `[id]`, `[...parts]`, or `[[...parts]]` directory segments
- **THEN** their target inputs receive a string, non-empty string array, or optional string array respectively

#### Scenario: Legacy route file is authored

- **WHEN** a project exports a route from `*.route.ts`, uses a default route export, or supplies `method` or `path`
- **THEN** compilation fails with a source-located migration diagnostic and a minimal corrected example

### Requirement: Convention-first route contracts

`defineRoute` SHALL infer routine request and response mappings from its target function schema while retaining complete explicit mapping overrides for transport-specific behavior.

#### Scenario: Read route input is inferred

- **WHEN** a read-method route targets a function with an object input containing path-segment keys and other fields
- **THEN** matching segment keys come from the path and remaining fields come from the query

#### Scenario: Write route input is inferred

- **WHEN** a write-method route targets a function with an object input containing path-segment keys and other fields
- **THEN** matching segment keys come from the path and remaining fields come from a JSON body

#### Scenario: Inference is ambiguous

- **WHEN** the target input lacks a projectable object schema or a path segment has no matching input field
- **THEN** compilation fails and explains how to provide an explicit request mapping

#### Scenario: Routine response is inferred

- **WHEN** a target returns a non-void output or throws a declared HTTP error
- **THEN** the route exposes the output as `200`, declared errors at their mapped statuses, and validation failures as `422`

#### Scenario: Non-routine transport is declared

- **WHEN** a route supplies explicit `request` or `responses`
- **THEN** that declaration completely replaces inference for the corresponding contract

### Requirement: Bounded file inputs

The default schema builder SHALL validate Web `File` values with optional byte and media-type limits, and route mappings SHALL support single and repeated multipart fields without exposing an HTTP-framework type.

#### Scenario: Valid file is submitted

- **WHEN** a multipart field contains a file within its declared byte and media-type limits
- **THEN** the target receives the validated Web `File`

#### Scenario: Invalid file is submitted

- **WHEN** a multipart file is missing, too large, or has a disallowed media type
- **THEN** request validation fails safely before target invocation

### Requirement: Serializable route rate limits

Routes SHALL support a serializable rate-limit policy containing a positive limit, window, request-derived key, and optional logical cache store without exposing runtime-framework types or arbitrary executable key functions.

#### Scenario: Production route uses rate limiting

- **WHEN** a production route declares a rate limit
- **THEN** it references a shared cache store or production validation rejects the configuration

#### Scenario: Development route omits a store

- **WHEN** a development route declares a rate limit without a store
- **THEN** a generation-local in-memory limit is allowed and clearly reported as non-distributed

### Requirement: Functions expose invocation and tool views

A function descriptor SHALL expose typed Promise-based `invoke(input)` and `asTool(options?)` operations without exposing internal engine types or duplicating the function handler.

#### Scenario: Function is invoked from ordinary application code

- **WHEN** application code awaits `getOrder.invoke({ orderId })`
- **THEN** TypeScript infers the function input and output and the call enters the common RELKIT invocation boundary

#### Scenario: Function becomes a tool

- **WHEN** `getOrder.asTool(...)` is declared
- **THEN** the resulting tool inherits the function schemas, errors, and handler target while adding only tool metadata

### Requirement: Domain-first source authoring

Application descriptors SHALL be recursively discovered beneath `src/<domain>`, with deterministic domain-prefixed source identities and one service composition point, while routes and platform configuration remain in their reserved layers.

#### Scenario: Source identity is omitted

- **WHEN** `src/orders/functions/create-order.function.ts` omits its ID
- **THEN** its ID is `orders.create-order` regardless of project root or discovery order

### Requirement: Service and integration factories are immutable public descriptors

The public API SHALL provide `defineService`, `defineServiceRoutes`, `defineDrizzleService`, `defineModel`, and `defineBetterAuthService` with inferred immutable types and SHALL reject removed service middleware, eager data-model, and Better Auth adapter forms.

#### Scenario: Removed authoring API is used

- **WHEN** application source uses `defineServiceMiddleware`, `defineDataModel`, or `betterAuthAdapter`
- **THEN** type checking or compilation fails and migration documentation identifies the replacement

### Requirement: Event contracts, publishers, and event functions are distinct

RELKIT SHALL expose contract-only `defineEvent`, callable `defineFunction`, and event-only `defineEventFunction` primitives; normal and event functions SHALL declare exact publishable event IDs through `publishes`, and only those IDs SHALL appear in `context.events`.

#### Scenario: Event relationship is authored

- **WHEN** an application defines an event, a publisher, and an event function using known registry IDs
- **THEN** the publisher can publish through its narrowed context and the event function receives the parsed event input without exposing direct invocation or tool conversion

#### Scenario: Invalid event-only fields are authored

- **WHEN** `defineEventFunction` declares `input`, `output`, `tool`, or `trigger`
- **THEN** type checking and compilation reject the field with a source-located correction

### Requirement: defineApp is the canonical application contract

`defineApp` SHALL be the sole application configuration constructor and SHALL accept application identity, handler-visible environment, singular provider capability inputs, profile defaults, telemetry, server, Inspector, and deployment descriptors as one immutable plain-TypeScript topology.

#### Scenario: Direct cache binding is authored

- **WHEN** an application passes `docker(redis())` to singular key `cache`
- **THEN** type inference retains the Redis adapter contract and normalization creates profile `default`

#### Scenario: Multiple cache bindings are authored

- **WHEN** `cache` is a map containing `requests` and `timeline`
- **THEN** logical cache descriptors can select either profile and no environment-specific provider branch is needed

### Requirement: Complete application descriptor surface

The public authoring API SHALL support the existing application concepts plus provider bindings, local sources, infrastructure sources, static integration descriptors, telemetry exporters, deployment engine/host descriptors, and explicit test replacements without exposing runtime clients or implementation import paths.

#### Scenario: Full canonical fixture is authored

- **WHEN** the commerce fixture declares application, domain, HTTP, async, resource, model, telemetry, local, and deployment concepts
- **THEN** every declaration is a branded value-free descriptor and application code performs no runtime registration

### Requirement: Public trace namespace

Function and authored-middleware contexts, including tool/event/job handlers, SHALL expose ctx.trace.span(name, callback), span(name, options, callback), event(name, attributes) and setAttributes(attributes). Span SHALL return a Promise preserving callback results/errors and activate its child context. Attributes SHALL accept only strings, finite numbers and booleans; custom kind SHALL default to internal with optional client. Reserved framework identity SHALL be immutable.

#### Scenario: No recording context exists

- **WHEN** code invokes the trace API without recording context
- **THEN** span still runs the callback exactly once and metadata methods are no-ops

#### Scenario: Span already completed

- **WHEN** retained asynchronous code attempts to mutate a completed span
- **THEN** its final metadata remains unchanged

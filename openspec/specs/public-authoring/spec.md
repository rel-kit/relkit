## Purpose

Defines the plain-TypeScript application authoring surface, portable contracts, descriptor semantics, conventions, and global provider selection visible to ZSys developers.

## Requirements

### Requirement: Plain TypeScript public boundary

Application developers SHALL author normal synchronous or asynchronous TypeScript handlers and Standard Schema-compatible contracts without importing or returning Effect, Hono, Next.js, Pulumi, cloud SDK, or provider-client types.

#### Scenario: Public declaration inspection

- **WHEN** the public packages and generated application declarations are emitted and scanned
- **THEN** no internal framework type appears in an application-facing signature

### Requirement: Function-only authored execution

Functions SHALL own ordinary invocation handlers; event listeners MAY own callback handlers as authoring sugar that compilation lowers into generated internal function identities. Routes, middleware declarations, jobs, schedules, and tools SHALL target stable function references, while agents and event callbacks SHALL execute only through generated internal functions and the common engine.

#### Scenario: Non-function handler is declared

- **WHEN** application code attempts to put a handler on a route, job, or tool descriptor
- **THEN** the public type contract or descriptor validation rejects it

#### Scenario: Event callback is declared

- **WHEN** application code exports `onEvent(eventName, callback)`
- **THEN** the callback receives typed payload/context while its compiled execution remains a function-engine invocation

#### Scenario: Route middleware is declared

- **WHEN** application code creates middleware metadata for a route
- **THEN** it receives a stable `MiddlewareRef` that targets a normal function through serializable request/decision mappings, constrains any short-circuit to a schema-compatible route-declared response, and exposes neither a middleware handler nor an HTTP-framework context

#### Scenario: Function dependency is declared

- **WHEN** a function or event callback declares another function, job, event, bucket, cache, or agent dependency
- **THEN** its context exposes only the correspondingly named and typed Promise-based clients

### Requirement: Standard Schema validation and projection

ZSys SHALL provide `@zsys/schema` with a familiar `z` builder and SHALL accept other Standard Schema-compatible schemas when validation and deterministic JSON Schema projection are available.

#### Scenario: Supported schema validates

- **WHEN** a sync or async compatible schema receives an unknown value
- **THEN** validation returns a typed value or structured issues with stable paths

#### Scenario: JSON Schema is unavailable

- **WHEN** a third-party Standard Schema cannot supply or support the JSON Schema needed for graph/OpenAPI generation
- **THEN** compilation fails with `ZSYS_SCHEMA_UNAVAILABLE` and a useful source location

### Requirement: Value-free environment contracts

Environment declarations SHALL produce static resolved types, runtime parsing rules, defaults, environment-specific requirements, descriptions, examples, sensitivity metadata, and JSON-safe graph projections without resolving process or file values during descriptor evaluation.

#### Scenario: Secret environment variable is compiled

- **WHEN** an environment descriptor includes a secret variable
- **THEN** graph metadata records its name, type, requirement/default presence, and sensitivity but never its value

#### Scenario: Runtime environment is invalid

- **WHEN** a runtime generation resolves a missing or malformed required value
- **THEN** readiness fails before provider construction or traffic activation and identifies the variable without revealing secret content

### Requirement: Stable immutable descriptors

Every application descriptor SHALL have an explicit stable ID, kind, global descriptor brand, typed reference, serializable declaration metadata, and development/test deep-freeze behavior; file paths SHALL NOT determine identity.

#### Scenario: Descriptor is mutated in development

- **WHEN** application code attempts to mutate a descriptor after creation
- **THEN** the mutation fails rather than silently changing compilation behavior

#### Scenario: Descriptor source file moves

- **WHEN** a descriptor moves to another source path without changing its stable ID or contract
- **THEN** its logical graph and deployment identity remain unchanged apart from source-location metadata

### Requirement: Complete v3 descriptor surface

The public authoring API SHALL support application, function, declared error, route, function-backed middleware metadata, job/schedule, event, event-trigger, bucket, cache, tool, and agent descriptors with the fields and constraints defined by the approved v3 baseline.

#### Scenario: Full fixture is authored

- **WHEN** the commerce fixture declares every in-scope concept through public packages
- **THEN** the source contains pure descriptor values and no direct registration with runtime frameworks or providers

### Requirement: Event listeners are generic trigger bindings

Event authoring SHALL expose `defineEvent`, typed selector helpers, and `onEvent`; `onEvent(eventName, handler, options?)` SHALL accept an autocomplete-enabled known event-name string, infer the payload, and create a generic event trigger backed by an internal function. ZSYS SHALL NOT expose `defineSubscription`, a subscription graph node, or a `*.subscription.ts` convention.

#### Scenario: Single event listener is authored

- **WHEN** `onEvent("orders.created", handler)` is exported
- **THEN** it returns an immutable event-trigger descriptor whose handler receives the event payload and framework-neutral event context

#### Scenario: Unknown event name is authored

- **WHEN** `onEvent` receives a string absent from the generated event registry
- **THEN** type checking and compilation reject it with the known event names

#### Scenario: Subscription primitive is searched

- **WHEN** public exports, generated projects, graph nodes, and conventions are scanned
- **THEN** no separate application subscription primitive exists

### Requirement: Serializable route and selector DSLs

HTTP request/response mappings and event selectors SHALL be declarative and serializable, SHALL preserve type relationships to their target functions, and SHALL reject arbitrary executable mapping or selector closures.

#### Scenario: Route mapping is projected

- **WHEN** a route maps path, query, header, cookie, JSON body, multipart, constant, nested, optional, default, or named-transform values
- **THEN** the mapping can be serialized into the graph and checked against the target input

#### Scenario: Named transform is declared

- **WHEN** a route binds a stable transform ID to a Standard Schema-compatible validator/transform
- **THEN** the graph contains only the ID and deterministic schema projection while the executable validator is resolved through the hash-matched runtime manifest

#### Scenario: Event selector combines known events

- **WHEN** `anyOf`, `match`, or restricted `all` selectors are declared
- **THEN** the selector carries enough metadata for deterministic compile-time expansion and typed target input

### Requirement: Conventions warn without excluding descriptors

Recommended directories, suffixes, grouping, and ID style SHALL continue to produce non-fatal diagnostics for branded descriptors, except that HTTP routes SHALL use the required `src/routes/**/route.ts` named-method convention because the source path defines their public URL and method.

#### Scenario: Valid non-route descriptor uses the wrong path

- **WHEN** a branded bucket descriptor is exported outside `src/buckets/**/*.bucket.ts`
- **THEN** compilation includes it and emits a convention warning without a non-zero exit solely for that warning

#### Scenario: Route uses the wrong path

- **WHEN** a route descriptor is exported outside `src/routes/**/route.ts`
- **THEN** compilation rejects it with a migration diagnostic because its method/path cannot be derived from the required convention

### Requirement: Global logical provider configuration

Applications SHALL choose concrete capability providers once per environment in the application descriptor, while resource and trigger descriptors reference only logical profiles and never contain vendor credentials, SDK clients, or implementation paths.

#### Scenario: Logical profile is selected

- **WHEN** a resource declares profile `archive`
- **THEN** compilation links it to the environment's global `archive` capability profile or emits `ZSYS_PROVIDER_PROFILE_UNKNOWN`

#### Scenario: Provider option references environment

- **WHEN** provider metadata uses a token such as `env.AWS_REGION`
- **THEN** descriptor evaluation records a typed variable reference without reading its value, graph projection contains only permitted non-secret metadata, and generation startup resolves the value after environment validation

### Requirement: Declared public errors

Applications SHALL be able to declare typed errors with stable IDs, validated safe data, messages, HTTP mappings, and retry classification, and handlers SHALL throw instances created by those declarations.

#### Scenario: Declared error is thrown

- **WHEN** a handler throws an error instance created from a declared error descriptor
- **THEN** the runtime can distinguish and safely expose the declared failure from provider failures, cancellation, timeouts, and unexpected defects

### Requirement: Ordinary application libraries remain opaque

Application developers SHALL remain free to call ordinary libraries from function handlers, and ZSys SHALL NOT infer or add those libraries' persistence, identity, workflow, knowledge, or other internal concepts to the application graph.

#### Scenario: Function uses an ordinary library

- **WHEN** a function imports and calls a non-ZSys database or HTTP client library
- **THEN** ZSys models only the function and its explicitly declared ZSys dependencies, not the library's internal resources or behavior

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

### Requirement: Convention-based typed configuration

ZSYS SHALL expose a typed configuration helper with nested server and inspector settings while fixing application entry, source discovery, exclusions, and generated-output locations as framework conventions.

#### Scenario: Ports are configured

- **WHEN** configuration declares server and inspector ports
- **THEN** development uses them unless a documented CLI flag or environment variable has higher precedence

#### Scenario: Legacy path key is supplied

- **WHEN** configuration contains `entry`, `source`, `exclude`, or `generatedDirectory`
- **THEN** loading fails with migration guidance instead of silently accepting the key

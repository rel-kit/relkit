## ADDED Requirements

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

## MODIFIED Requirements

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

### Requirement: Conventions warn without excluding descriptors

Recommended directories, suffixes, grouping, and ID style SHALL continue to produce non-fatal diagnostics for branded descriptors, except that HTTP routes SHALL use the required `src/routes/**/route.ts` named-method convention because the source path defines their public URL and method.

#### Scenario: Valid non-route descriptor uses the wrong path

- **WHEN** a branded bucket descriptor is exported outside `src/buckets/**/*.bucket.ts`
- **THEN** compilation includes it and emits a convention warning without a non-zero exit solely for that warning

#### Scenario: Route uses the wrong path

- **WHEN** a route descriptor is exported outside `src/routes/**/route.ts`
- **THEN** compilation rejects it with a migration diagnostic because its method/path cannot be derived from the required convention

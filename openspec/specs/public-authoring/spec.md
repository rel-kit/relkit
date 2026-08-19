## Purpose

Defines the plain-TypeScript application authoring surface, portable contracts, descriptor semantics, conventions, and global provider selection visible to ZSys developers.

## Requirements

### Requirement: Plain TypeScript public boundary

Application developers SHALL author normal synchronous or asynchronous TypeScript handlers and Standard Schema-compatible contracts without importing or returning Effect, Hono, Next.js, Pulumi, cloud SDK, or provider-client types.

#### Scenario: Public declaration inspection

- **WHEN** the public packages and generated application declarations are emitted and scanned
- **THEN** no internal framework type appears in an application-facing signature

### Requirement: Function-only authored execution

Functions SHALL be the only authored descriptors that own user handlers; routes, middleware declarations, jobs, schedules, event listeners, and tools SHALL target stable function references, while agents SHALL compile to generated internal function identities.

#### Scenario: Non-function handler is declared

- **WHEN** application code attempts to put a handler on a route, job, event-trigger, or tool descriptor
- **THEN** the public type contract or descriptor validation rejects it

#### Scenario: Route middleware is declared

- **WHEN** application code creates middleware metadata for a route
- **THEN** it receives a stable `MiddlewareRef` that targets a normal function through serializable request/decision mappings, constrains any short-circuit to a schema-compatible route-declared response, and exposes neither a middleware handler nor an HTTP-framework context

#### Scenario: Function dependency is declared

- **WHEN** a function declares another function, job, event, bucket, cache, or agent dependency
- **THEN** its handler context exposes only the correspondingly named and typed Promise-based clients

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

Event authoring SHALL expose `defineEvent`, selector helpers, and `onEvent`; `onEvent` SHALL create an `event-trigger` descriptor targeting a function, and ZSys SHALL NOT expose `defineSubscription`, a subscription graph node, or a `*.subscription.ts` convention.

#### Scenario: Single event listener is authored

- **WHEN** `onEvent(eventRef, options)` is used with a target function
- **THEN** it returns an immutable event-trigger descriptor with the declared delivery and retry policy

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

Recommended directories, suffixes, export style, multiple-kind grouping, and ID style SHALL produce structured informational or warning diagnostics while descriptor discovery continues by runtime brand.

#### Scenario: Valid descriptor uses the wrong path

- **WHEN** a branded bucket descriptor is exported outside `src/buckets/**/*.bucket.ts`
- **THEN** compilation includes it and emits `ZSYS_CONVENTION_DIRECTORY` or `ZSYS_CONVENTION_SUFFIX` without a non-zero exit solely for that warning

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

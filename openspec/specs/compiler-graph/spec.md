## Purpose

Defines how application descriptors become deterministic diagnostics, a canonical graph, executable references, generated contracts, and compatibility information.

## Requirements

### Requirement: Non-executing candidate discovery

The compiler SHALL use source analysis to identify candidate descriptor modules without executing application code, then SHALL evaluate only candidates in a controlled child process with a fixed root, timeout, captured output, source maps, generation identity, and restricted side effects.

#### Scenario: Ordinary helper file is scanned

- **WHEN** a source file contains no descriptor candidate indicators
- **THEN** the prefilter excludes it without executing the module

#### Scenario: Candidate leaves a side effect

- **WHEN** descriptor evaluation opens a listener, leaves a timer, writes outside allowed output, spawns a process, prints directly, or performs a disallowed network request that the POC detector supports
- **THEN** evaluation reports a structured diagnostic and does not corrupt the evaluator protocol

### Requirement: Ordered semantic validation

Compilation SHALL normalize and validate descriptor fields, inferred and explicit identities, schemas, references, mappings, selectors, policies, provider profiles, service membership, collisions, and executable handlers before emitting activatable outputs; dynamic function-call cycles SHALL remain subject to runtime invocation-chain enforcement.

#### Scenario: Semantic error exists

- **WHEN** compilation finds an inferred or explicit ID collision, missing target, route collision, incompatible mapping/target, invalid cron/retry policy, empty selector, unknown profile, duplicate service ownership, or missing handler
- **THEN** it exits non-zero with stable diagnostic codes and emits no activatable manifest

#### Scenario: Convention warning exists

- **WHEN** compilation finds only convention warnings
- **THEN** it emits the graph and manifest and exits successfully

### Requirement: Structured portable diagnostics

Compiler diagnostics SHALL include stable code, severity, message, optional project-relative location and descriptor ID, related locations, suggestion, and documentation path, and SHALL be available to terminal, JSON consumers, the inspector, the compiler API, and supported CI annotation adapters.

#### Scenario: Duplicate ID is reported

- **WHEN** two descriptors use the same stable ID
- **THEN** `RELKIT_DUPLICATE_ID` identifies both project-relative source locations

### Requirement: Canonical deterministic graph

The compiler SHALL produce byte-identical canonical graph JSON and graph hashes regardless of absolute repository path, file enumeration or evaluation order, object insertion order, path separator, wall-clock time, process ID, or random source.

#### Scenario: Equivalent projects compile in different roots

- **WHEN** the same fixture is compiled from two absolute directories with shuffled input order and different process/time values
- **THEN** graph, OpenAPI, generated client, and hash bytes are identical

### Requirement: Complete serializable application model

The graph SHALL describe app/environment metadata, services and ordered membership, functions, triggers, jobs, events, buckets, cache, tools, agents, provider bindings by capability/profile/adapter/ownership, value-free environment references, declared dependency and membership edges, source locations, selector expansions, and generated identities without executable closures, resolved environment values, credentials, or live clients.

#### Scenario: Graph is inspected as JSON

- **WHEN** a full fixture graph is recursively inspected
- **THEN** every required provider binding and relationship is present, all content is JSON-safe, and no resolved environment or credential value appears

#### Scenario: Bucket profile is reused

- **WHEN** normalization finds multiple bucket descriptors linked to one profile
- **THEN** compilation emits a deterministic error before graph activation

### Requirement: Generic trigger compilation

Routes and event listeners SHALL remain distinct authoring and inspector concepts but SHALL compile to generic trigger nodes targeting authored or generated function IDs; file-derived HTTP variants and event selector patterns SHALL expand at compile time into sorted deterministic registrations.

#### Scenario: Pattern selector matches events

- **WHEN** `events.match("orders.*")` is compiled against known event descriptors
- **THEN** the graph stores the deterministic expansion and compatibility diffing can detect later expansion

#### Scenario: Pattern matches no known event

- **WHEN** a syntactically valid event pattern expands to no known event/version pair
- **THEN** compilation emits the `RELKIT_EVENT_SELECTOR_EMPTY` no-match warning and still distinguishes that warning from an invalid explicitly empty selector

#### Scenario: File route expands

- **WHEN** a required or optional catch-all route is compiled
- **THEN** its graph trigger retains one logical ID and deterministic runtime/OpenAPI variants derived from the source path

### Requirement: Middleware relationships are deterministic

The compiler SHALL sort middleware by canonical ID and classify every known route relationship as `always`, `conditional`, or absent using the supported middleware path grammar.

#### Scenario: Discovery order changes

- **WHEN** equivalent middleware modules are enumerated or evaluated in a different order
- **THEN** graph bytes, manifest registration order, route relationships, and graph hash remain identical

### Requirement: Deterministic generated artifacts

Compilation SHALL generate `application.graph.json`, `runtime.manifest.ts`, `diagnostics.json`, `openapi.json`, `client.ts`, and the event registry declaration with contract/generator versions, no nondeterministic timestamp, normalized paths, atomic content-aware writes, and deployment plan output only when requested.

#### Scenario: Unchanged source is recompiled

- **WHEN** generated content is byte-identical to existing output
- **THEN** the compiler leaves file contents and modification state unchanged

#### Scenario: Registry content changes

- **WHEN** the known event set changes
- **THEN** only changed generated artifacts are atomically replaced and no partial registry is observable

#### Scenario: Invalid source follows a valid compile

- **WHEN** compilation fails after a valid generated artifact set exists
- **THEN** diagnostics update while the last valid graph and activatable artifacts remain unchanged

### Requirement: Incremental compilation preserves full-build truth

Watch-mode compilation SHALL invalidate only affected discovery, descriptor, graph, and generated-output dependencies while producing the same diagnostics, canonical bytes, hash, and activatable outputs as a clean full compilation of the same source state.

#### Scenario: One descriptor changes during watch mode

- **WHEN** an affected descriptor and its dependants are incrementally recompiled
- **THEN** the result is byte-identical to an immediate clean full compile, unaffected generated files are not rewritten, and stale candidates cannot reuse invalid cached output

### Requirement: Pure deterministic registration planning

The planner SHALL convert the graph into a deterministic registration plan for functions, HTTP triggers, queues, schedules, event triggers, buckets, cache, tools, and agents without constructing provider clients or mutating the graph.

#### Scenario: Same graph is planned twice

- **WHEN** an identical canonical graph is supplied twice
- **THEN** the registration plans are deeply equal and no runtime resource has been acquired

### Requirement: Compatibility diff classification

Graph diffing SHALL report additions, removals, and contract changes across routes, functions/errors, events/selectors, jobs, buckets/cache, tools, agents, and provider profiles as informational, compatible, potentially breaking, or breaking.

#### Scenario: Stable source move is compared

- **WHEN** only a descriptor source path changes while its stable ID and contract stay the same
- **THEN** the diff does not classify the logical capability or deployment identity as breaking

#### Scenario: Function output contract breaks

- **WHEN** a required output field is removed or made incompatible
- **THEN** graph diff classifies the change as breaking and identifies the function ID

### Requirement: Observed edges remain separate

The canonical graph SHALL contain declared managed-resource and structural relationships, while runtime-observed function calls and managed operations SHALL be recorded separately and SHALL NOT mutate the canonical graph or its hash.

#### Scenario: Function uses a declared cache

- **WHEN** a running function accesses its cache client
- **THEN** the inspector can show both the declared edge and a separately recorded observed edge without changing the graph hash

#### Scenario: Function invokes another function

- **WHEN** a running function calls another descriptor through `invoke`
- **THEN** the inspector can show an observed `calls-function` edge even though no declared function edge was required

### Requirement: Deterministic route-file discovery and lowering

The compiler SHALL derive route methods and paths from named exports in `src/routes/**/route.ts`, normalize static/dynamic/catch-all segments, infer missing contracts from projectable target schemas, and lower optional catch-alls into deterministic runtime variants without changing the authored route ID.

#### Scenario: Optional catch-all route compiles

- **WHEN** `src/routes/docs/[[...parts]]/route.ts` exports `GET`
- **THEN** one logical route produces `/docs` and `/docs/:parts{.+}` runtime variants with one stable client operation

#### Scenario: Route variants collide

- **WHEN** two authored routes normalize to the same method and runtime path variant
- **THEN** compilation emits `RELKIT_ROUTE_COLLISION` with both source locations and emits no activatable manifest

### Requirement: Generated typed event registry

Compilation SHALL generate a deterministic TypeScript declaration mapping discovered event IDs to input, version, and descriptor types before project type checking, and SHALL use the same registry to validate `publishes` and event-function event names.

#### Scenario: Event is added

- **WHEN** a new event descriptor is discovered by `relkit dev`, `relkit check`, or project creation
- **THEN** the registry is atomically refreshed and editor/type-checking consumers can autocomplete its ID

#### Scenario: Event is removed

- **WHEN** a publisher or event function still names a removed event
- **THEN** stale generated declarations cannot make compilation succeed and an unknown-event diagnostic is emitted

### Requirement: Source-scoped IDs are derived deterministically

When an eligible source-scoped descriptor omits `id`, the compiler SHALL derive one filesystem-safe stable ID from its descriptor kind, project-relative convention hierarchy, export or local binding, service membership, and route method/path as applicable; an explicit ID SHALL always override inference.

#### Scenario: Route ID is inferred

- **WHEN** `src/routes/orders/[orderId]/route.ts` exports `GET` without an ID
- **THEN** the resolved route ID is the safe canonical equivalent of `route.get.orders.by-order-id` while its displayed operation remains `GET /orders/{orderId}`

#### Scenario: Function ID is inferred

- **WHEN** a named `getOrder` function descriptor under the `orders` source hierarchy omits its ID
- **THEN** the compiler resolves a stable ID equivalent to `orders.get-order`, using the default-export file stem when no named binding exists

#### Scenario: Service member ID is inferred

- **WHEN** service `orders` contains member `getOrder` whose function has no explicit ID
- **THEN** the compiler resolves the member function ID as `orders.get-order`

#### Scenario: Error ID is inferred

- **WHEN** `const InvalidError = defineError(...)` is statically identifiable under the `orders` hierarchy
- **THEN** its resolved ID is equivalent to `orders.InvalidError`

#### Scenario: Inference is ambiguous

- **WHEN** an eligible descriptor has neither an explicit ID nor one statically identifiable binding, export, service member, or route operation
- **THEN** compilation fails with a source-located diagnostic requiring an explicit ID

#### Scenario: Two IDs collide

- **WHEN** explicit and inferred identities normalize to the same global ID
- **THEN** `RELKIT_DUPLICATE_ID` identifies every origin and no activatable output is emitted

### Requirement: Inferred identities are bound into executable output

The generated manifest SHALL bind every inferred identity to its original executable descriptor so registry lookup, nested `invoke`, schemas, errors, middleware, logging, and traces use the resolved ID rather than an authoring placeholder.

#### Scenario: Inferred function invokes inferred function

- **WHEN** two ID-less source functions are compiled and one invokes the other
- **THEN** the active registry resolves both canonical IDs and records the correct caller and callee

### Requirement: Services compile as structural graph nodes

The compiler SHALL emit each service as a graph node with ordered member and middleware relationships and SHALL emit executable service policy in the hash-matched manifest without duplicating member handlers.

#### Scenario: Service is compiled

- **WHEN** an exported service contains three functions and two middleware entries
- **THEN** the graph contains one service node, three membership relationships in deterministic member order, and two ordered middleware references, while the manifest reuses the three original handlers

#### Scenario: Function belongs to two services

- **WHEN** the same function descriptor is declared as a member of two services
- **THEN** compilation rejects ambiguous service ownership and identifies both declarations

### Requirement: Domain ownership and exposure are canonical graph data

Every domain-owned graph node SHALL carry its domain ID, functions/events/errors SHALL declare public or internal exposure, and service nodes SHALL contain serializable public membership and optional Drizzle or Better Auth capability metadata.

#### Scenario: Graph is serialized

- **WHEN** a compiled application graph is encoded as JSON
- **THEN** it contains no live clients, handlers, callbacks, credentials, raw Drizzle objects, or filesystem-root-dependent identities

### Requirement: Domain relationships use explicit graph edges

The graph SHALL represent public function/event exposure, service dependencies, auth mounts, and function-declared errors using versioned deterministic edges while preserving runtime-observed invocation edges separately.

#### Scenario: Domain imports another service

- **WHEN** one or more files in `billing` import `orders/service.ts`
- **THEN** the graph contains one deterministic `billing` to `orders` service dependency edge without inventing exact function-call edges

### Requirement: Errors are first-class graph nodes

Declared errors SHALL be deduplicated as graph nodes with safe schema, HTTP, retry, source, domain, and exposure metadata and SHALL remain projected into function contracts for HTTP and client generation.

#### Scenario: Error is shared

- **WHEN** several functions declare the same error descriptor
- **THEN** the graph contains one error node and one declaration edge from each function

### Requirement: Event functions lower to authored functions and exact triggers

The compiler SHALL emit one authored function node marked `event-only` and one deterministic `relkit.event.<function-id>.trigger` node for each event function, with one target edge and one exact listener edge, without a hidden generated function or duplicate consumer edge.

#### Scenario: Event function compiles

- **WHEN** a valid event function names a known event
- **THEN** its function input matches the event schema, its output is void, and its trigger stores the exact event ID/version and normalized delivery configuration

### Requirement: Event-only and publication diagnostics are source located

Compilation SHALL diagnose unknown consumer events, unknown or duplicate publications, forbidden event-function fields/results/targets, non-event invocation paths, and generated-trigger identity collisions with the authored ID, invalid target, source location, and correction.

#### Scenario: Route targets an event function

- **WHEN** a route references an event-only function
- **THEN** compilation emits a source-located error and no activatable manifest

### Requirement: Generated activation cohort is complete and deterministic

Compilation SHALL emit graph v8, manifest v8, runtime-integration plan v1, local-service plan v1 when declared, deployment plan v3 when requested, and non-secret activation metadata whose individual hashes form one composite activation fingerprint.

#### Scenario: Equivalent projects compile in different roots

- **WHEN** input order, absolute root, process identity, and time differ while authored topology is equivalent
- **THEN** graph, manifest, plan bytes, static import order, individual hashes, and activation fingerprint remain identical

#### Scenario: Previous artifact is activated

- **WHEN** runtime receives graph v7, manifest v7, deployment plan v2, or a missing required v1 plan
- **THEN** activation fails with a precise rebuild or regeneration diagnostic

### Requirement: Runtime integrations are statically planned

The compiler SHALL derive selected integration IDs and package exports from branded descriptors, emit deterministic static runtime references only for graph-required integrations, and reject application-authored import paths, duplicate registrations, package-root escapes, and protocol mismatches.

#### Scenario: Application contains a runtime import path

- **WHEN** an authored descriptor attempts to select an implementation by arbitrary module path
- **THEN** compilation fails before generating executable output

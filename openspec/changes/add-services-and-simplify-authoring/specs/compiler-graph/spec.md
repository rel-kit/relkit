## MODIFIED Requirements

### Requirement: Ordered semantic validation

Compilation SHALL normalize and validate descriptor fields, inferred and explicit identities, schemas, references, mappings, selectors, policies, provider profiles, service membership, collisions, and executable handlers before emitting activatable outputs; dynamic function-call cycles SHALL remain subject to runtime invocation-chain enforcement.

#### Scenario: Semantic error exists

- **WHEN** compilation finds an inferred or explicit ID collision, missing target, route collision, incompatible mapping/target, invalid cron/retry policy, empty selector, unknown profile, duplicate service ownership, or missing handler
- **THEN** it exits non-zero with stable diagnostic codes and emits no activatable manifest

#### Scenario: Convention warning exists

- **WHEN** compilation finds only convention warnings
- **THEN** it emits the graph and manifest and exits successfully

### Requirement: Complete serializable application model

The graph SHALL describe app/environment metadata, services and ordered membership, functions, generic triggers (including ordered middleware targets and named transform metadata), jobs, events, buckets, cache, tools, agents, provider profiles, declared managed-resource and membership edges, source locations, selector expansions, and generated agent identities without executable closures, resolved environment values, credentials, or live clients.

#### Scenario: Graph is inspected as JSON

- **WHEN** a full fixture graph is recursively inspected
- **THEN** all managed concepts, service relationships, and required declared managed-resource edge kinds are present and every value is JSON-safe and secret-free

### Requirement: Observed edges remain separate

The canonical graph SHALL contain declared managed-resource and structural relationships, while runtime-observed function calls and managed operations SHALL be recorded separately and SHALL NOT mutate the canonical graph or its hash.

#### Scenario: Function uses a declared cache

- **WHEN** a running function accesses its cache client
- **THEN** the inspector can show both the declared edge and a separately recorded observed edge without changing the graph hash

#### Scenario: Function invokes another function

- **WHEN** a running function calls another descriptor through `invoke`
- **THEN** the inspector can show an observed `calls-function` edge even though no declared function edge was required

## ADDED Requirements

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
- **THEN** `ZSYS_DUPLICATE_ID` identifies every origin and no activatable output is emitted

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


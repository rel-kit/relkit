## Purpose

Defines domain services as first-class groups of functions with shared invocation policy, isolated context enrichment, documentation grouping, and service-aware runtime attribution.
## Requirements
### Requirement: Services group typed function members

A service SHALL identify one source domain and MAY expose named function and event descriptors as direct, typed, referentially identical public members without owning a business handler or invocation policy. A compiler SHALL allow an empty authored facade only when the same domain owns another graph-visible capability.

#### Scenario: Service member targets a route

- **WHEN** `orders.getOrder` is used as a route target
- **THEN** the route retains the original function's input, output, errors, invocation behavior, and domain service identity

#### Scenario: Invalid service member is declared

- **WHEN** a service member has the wrong descriptor kind, a reserved name, or belongs to another domain
- **THEN** authoring or compilation fails with a source-located diagnostic

### Requirement: Service metadata is consistently projected

The compiler and runtimes SHALL project domain identity, service metadata, public function/event membership, specialized capability metadata, dependencies, and public/internal exposure consistently into the graph, manifest, OpenAPI grouping, logs, traces, and Inspector without cloning member descriptors.

#### Scenario: Service-backed API is compiled

- **WHEN** several routes target public functions of one domain service
- **THEN** graph and runtime records identify the service and original function and the Inspector groups all public and internal domain artifacts together

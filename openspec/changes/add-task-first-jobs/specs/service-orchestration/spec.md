## MODIFIED Requirements

### Requirement: Services group typed function members

A domain service SHALL expose optional function, event, task and job maps as flattened direct, typed, referentially identical members without owning a business handler or invocation policy. Empty facades SHALL remain valid only when the domain owns another graph-visible capability. Task/job member names SHALL obey safe alias validation and all member categories SHALL reject collisions/reserved names/cross-domain ownership.

#### Scenario: Service member targets a route

- **WHEN** `orders.getOrder` is used as a route target
- **THEN** the route retains the original function's input, output, errors, invocation behavior, and domain service identity

#### Scenario: Invalid service member is declared

- **WHEN** a service member has the wrong descriptor kind, a reserved name, or belongs to another domain
- **THEN** authoring or compilation fails with a source-located diagnostic

### Requirement: Service metadata is consistently projected

The compiler and runtimes SHALL project domain identity, service metadata, public function/event/task/job membership, specialized capability metadata, dependencies, and public/internal exposure consistently into the graph, manifest, OpenAPI grouping, logs, traces, and Inspector without cloning member descriptors.

#### Scenario: Service-backed API is compiled

- **WHEN** several routes target public functions of one domain service
- **THEN** graph and runtime records identify the service and original function and the Inspector groups all public and internal domain artifacts together

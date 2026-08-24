## Purpose

Defines domain services as first-class groups of functions with shared invocation policy, isolated context enrichment, documentation grouping, and service-aware runtime attribution.

## Requirements

### Requirement: Services group typed function members

A service SHALL declare a non-empty named map of function descriptors and SHALL expose those same members as typed service-scoped function references without owning a separate business handler or becoming an invokable workflow.

#### Scenario: Service member targets a route

- **WHEN** `OrderService.getOrder` is used as a route target
- **THEN** the route retains the member function's input, output, errors, invocation behavior, and service identity

#### Scenario: Invalid service member is declared

- **WHEN** a service member is not a function descriptor or two normalized member names collide
- **THEN** authoring or compilation fails with a source-located diagnostic

### Requirement: Service policy applies to every invocation source

Ordered service middleware SHALL run through the common invocation engine for each service-member invocation from HTTP, direct calls, jobs, events, tools, and agents, after input validation and before the member handler.

#### Scenario: Member is reached from different sources

- **WHEN** the same service member is invoked over HTTP and through another function
- **THEN** the same ordered service middleware runs once for each invocation and the member handler runs only after it succeeds

#### Scenario: Service middleware rejects an invocation

- **WHEN** service middleware throws a declared rejection before calling `next`
- **THEN** later middleware and the member handler do not run, and the common engine records the normalized outcome

#### Scenario: Service middleware controls continuation

- **WHEN** service middleware returns without calling `next` or calls `next` more than once
- **THEN** the engine records a safe policy defect and does not admit an extra member-handler execution

### Requirement: Service context is scoped and immutable

Service middleware SHALL be able to enrich a per-invocation service context without mutating the raw transport request, the base public context, another concurrent invocation, or process-global state.

#### Scenario: Middleware enriches context

- **WHEN** middleware adds authenticated principal or tenant data
- **THEN** downstream service middleware and the member handler observe an immutable merged service context for that invocation only

#### Scenario: Concurrent members execute

- **WHEN** two invocations of the same service run concurrently with different context values
- **THEN** neither invocation can observe or mutate the other's service context

### Requirement: Service metadata is consistently projected

The compiler and runtimes SHALL project service identity, title, description, tags, ordered membership, and member relationships consistently into the canonical graph, runtime manifest, OpenAPI/Scalar grouping, logs, traces, and inspector data.

#### Scenario: Service-backed API is compiled

- **WHEN** several routes target members of one service
- **THEN** their OpenAPI operations share the service tag and their graph and runtime records identify both the service and member function

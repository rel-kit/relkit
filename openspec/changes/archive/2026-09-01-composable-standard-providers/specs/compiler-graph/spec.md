## MODIFIED Requirements

### Requirement: Complete serializable application model

The graph SHALL describe app/environment metadata, services and ordered membership, functions, triggers, jobs, events, buckets, cache, tools, agents, provider bindings by capability/profile/adapter/ownership, value-free environment references, declared dependency and membership edges, source locations, selector expansions, and generated identities without executable closures, resolved environment values, credentials, or live clients.

#### Scenario: Graph is inspected as JSON

- **WHEN** a full fixture graph is recursively inspected
- **THEN** every required provider binding and relationship is present, all content is JSON-safe, and no resolved environment or credential value appears

#### Scenario: Bucket profile is reused

- **WHEN** normalization finds multiple bucket descriptors linked to one profile
- **THEN** compilation emits a deterministic error before graph activation

### Requirement: Hash-matched runtime manifest

The compiler SHALL generate graph and manifest contracts with versions bumped together; the manifest SHALL contain executable function, path-scoped middleware, and lifecycle-hook handlers, provider adapter factories keyed independently by capability and adapter, and request transforms plus the expected graph hash. Runtime activation SHALL fail on a version, hash, missing reference, or required-handler/factory mismatch.

#### Scenario: Manifest and graph differ

- **WHEN** a manifest graph hash or contract cohort does not match the graph
- **THEN** activation is rejected with a structured mismatch diagnostic

#### Scenario: Handler reference is missing

- **WHEN** a function, middleware, or generated hook graph node has no required executable manifest binding
- **THEN** compilation or activation fails with a stable missing-binding diagnostic

#### Scenario: Middleware or transform reference is invalid

- **WHEN** an HTTP trigger names an absent path-scoped middleware or request transform, or two named transforms collide
- **THEN** compilation emits a stable source-located diagnostic and no activatable manifest

#### Scenario: Required adapter factory is missing

- **WHEN** a graph-required binding has no matching runtime factory
- **THEN** activation fails before traffic without constructing unrelated capability bindings

## ADDED Requirements

### Requirement: Provider contracts are versioned as a cohort

Graph, manifest, and deployment-plan contracts SHALL be bumped for the breaking provider representation and checked at every compiler/runtime/deployment boundary.

#### Scenario: Old provider artifact is consumed

- **WHEN** a runtime or deploy command receives a pre-redesign graph, manifest, or plan
- **THEN** it rejects the artifact with a version diagnostic rather than interpreting old provider recipes

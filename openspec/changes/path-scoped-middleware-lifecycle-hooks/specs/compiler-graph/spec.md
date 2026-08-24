## MODIFIED Requirements

### Requirement: Complete serializable application model

The graph SHALL describe app/environment metadata, services and ordered membership, functions, first-class path-scoped middleware, generated lifecycle hooks, generic triggers, jobs, events, buckets, cache, tools, agents, provider profiles, declared relationships, source locations, selector expansions, and generated identities without executable closures, resolved environment values, credentials, or live clients.

#### Scenario: Graph is inspected as JSON

- **WHEN** a full fixture graph is recursively inspected
- **THEN** middleware paths, deterministic order, route match classification, hook ownership and phase, and required managed-resource edge kinds are present and every value is JSON-safe and secret-free

### Requirement: Hash-matched runtime manifest

The compiler SHALL generate a versioned runtime manifest containing executable function handlers, path-scoped middleware handlers, lifecycle hook callbacks, provider factories, and named request-transform validators plus the expected graph hash, and runtime activation SHALL fail on a version, hash, missing reference, or required-handler mismatch.

#### Scenario: Manifest and graph differ

- **WHEN** a manifest graph hash does not equal the canonical graph hash
- **THEN** activation is rejected with `ZSYS_GRAPH_MANIFEST_MISMATCH`

#### Scenario: Handler reference is missing

- **WHEN** a function, middleware, or generated hook graph node has no required executable manifest binding
- **THEN** compilation or activation fails with a stable missing-binding diagnostic

#### Scenario: Transform reference is invalid

- **WHEN** an HTTP trigger names an absent request transform or two named transforms collide
- **THEN** compilation emits a stable source-located diagnostic and no activatable manifest

## ADDED Requirements

### Requirement: Middleware relationships are deterministic

The compiler SHALL sort middleware by canonical ID and classify every known route relationship as `always`, `conditional`, or absent using the supported middleware path grammar.

#### Scenario: Discovery order changes

- **WHEN** equivalent middleware modules are enumerated or evaluated in a different order
- **THEN** graph bytes, manifest registration order, route relationships, and graph hash remain identical

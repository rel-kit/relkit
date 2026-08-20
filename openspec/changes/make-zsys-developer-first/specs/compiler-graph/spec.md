## ADDED Requirements

### Requirement: Deterministic route-file discovery and lowering

The compiler SHALL derive route methods and paths from named exports in `src/routes/**/route.ts`, normalize static/dynamic/catch-all segments, infer missing contracts from projectable target schemas, and lower optional catch-alls into deterministic runtime variants without changing the authored route ID.

#### Scenario: Optional catch-all route compiles

- **WHEN** `src/routes/docs/[[...parts]]/route.ts` exports `GET`
- **THEN** one logical route produces `/docs` and `/docs/:parts{.+}` runtime variants with one stable client operation

#### Scenario: Route variants collide

- **WHEN** two authored routes normalize to the same method and runtime path variant
- **THEN** compilation emits `ZSYS_ROUTE_COLLISION` with both source locations and emits no activatable manifest

### Requirement: Generated typed event registry

Compilation SHALL generate a deterministic TypeScript declaration mapping discovered event IDs to payload, version, and descriptor types before project type checking, and SHALL use the same registry to validate callback listener names and selectors.

#### Scenario: Event is added

- **WHEN** a new event descriptor is discovered by `zsys dev`, `zsys check`, or project creation
- **THEN** the registry is atomically refreshed and editor/type-checking consumers can autocomplete its ID

#### Scenario: Event is removed

- **WHEN** a listener still names a removed event
- **THEN** stale generated declarations cannot make compilation succeed and an unknown-event diagnostic is emitted

### Requirement: Callback listeners lower through the common engine

The compiler SHALL lower each event callback into a generated internal function and a generic event trigger while preserving explicit or derived listener identity, dependencies, delivery policy, source metadata, and deterministic graph output.

#### Scenario: Listener omits an ID

- **WHEN** a named listener export omits `options.id`
- **THEN** compilation derives a stable ID from the event name and export name and rejects global duplicates

#### Scenario: Listener declares dependencies

- **WHEN** a callback listener declares typed dependencies
- **THEN** the generated function receives only those clients and all delivery invocations pass through the common engine with source `event`

## MODIFIED Requirements

### Requirement: Generic trigger compilation

Routes and event listeners SHALL remain distinct authoring and inspector concepts but SHALL compile to generic trigger nodes targeting authored or generated function IDs; file-derived HTTP variants and event selector patterns SHALL expand at compile time into sorted deterministic registrations.

#### Scenario: Pattern selector matches events

- **WHEN** `events.match("orders.*")` is compiled against known event descriptors
- **THEN** the graph stores the deterministic expansion and compatibility diffing can detect later expansion

#### Scenario: Pattern matches no known event

- **WHEN** a syntactically valid event pattern expands to no known event/version pair
- **THEN** compilation emits the `ZSYS_EVENT_SELECTOR_EMPTY` no-match warning and still distinguishes that warning from an invalid explicitly empty selector

#### Scenario: File route expands

- **WHEN** a required or optional catch-all route is compiled
- **THEN** its graph trigger retains one logical ID and deterministic runtime/OpenAPI variants derived from the source path

### Requirement: Deterministic generated artifacts

Compilation SHALL generate `application.graph.json`, `runtime.manifest.ts`, `diagnostics.json`, `openapi.json`, `client.ts`, and the event registry declaration with contract/generator versions, no nondeterministic timestamp, normalized paths, atomic content-aware writes, and deployment plan output only when requested.

#### Scenario: Unchanged source is recompiled

- **WHEN** generated content is byte-identical to existing output
- **THEN** the compiler leaves file contents and modification state unchanged

#### Scenario: Registry content changes

- **WHEN** the known event set changes
- **THEN** only changed generated artifacts are atomically replaced and no partial registry is observable

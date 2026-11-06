## MODIFIED Requirements

### Requirement: Integrations are independently installable workspace packages

The workspace SHALL register a top-level integrations catalog and independently publishable packages for Redis, S3, Docker, local services, Cloudflare, selected agent execution, Sentry, OTLP, AWS, and Pulumi. Each package SHALL own its exports, project reference, build/check/test participation, public documentation, packed-package verification, and release classification.

#### Scenario: Application installs only Redis

- **WHEN** it depends on `@relkit/redis`
- **THEN** package resolution and generated runtime output do not require S3, AWS, Pulumi, Sentry, OTLP, or their SDKs

#### Scenario: Application installs the catalog

- **WHEN** it installs or reads `@relkit/integrations`
- **THEN** only capability/package metadata is available, executable integration re-exports are absent, and selecting Redis uses `@relkit/redis` directly without installing every catalog entry

### Requirement: Integration dependency direction is enforced

Core authoring, compiler, graph, engine, runtime, testing, CLI, and deployment-contract packages SHALL NOT depend on concrete integrations. Standalone integrations SHALL depend only on permitted core protocols and their selected implementation requirements. The catalog SHALL contain metadata without dependencies or executable re-exports that install integrations. Generated applications SHALL statically import selected standalone runtime exports.

#### Scenario: Core package imports an integration

- **WHEN** boundary validation finds a concrete integration dependency in core
- **THEN** repository checks fail without weakening structural allowlists

### Requirement: Shared dependency versions have one authoritative definition

Shared external dependency pins and intentionally supported peer ranges SHALL have one authoritative workspace definition. Workspace installation, compatibility checks, release staging, and scaffold generation SHALL resolve those definitions consistently and reject missing references.

#### Scenario: A shared version changes

- **WHEN** a contributor changes one authoritative shared dependency pin and regenerates derived metadata
- **THEN** every participating workspace, packaged manifest, and generated standalone project uses the corresponding resolved version without an additional manual pin change

#### Scenario: A reference is missing

- **WHEN** a dependency references an absent catalog or entry
- **THEN** installation or validation fails with the dependency and missing reference identified

#### Scenario: Published package is consumed outside the workspace

- **WHEN** a consumer installs a packed package in a clean standalone directory
- **THEN** its external dependency declarations are concrete versions or supported peer ranges and require no original workspace catalog or path

#### Scenario: Peer compatibility is retained

- **WHEN** an intentionally broad supported peer range is packed
- **THEN** it retains that supported range rather than narrowing to the workspace's development version

#### Scenario: Optional SDK metadata is regenerated

- **WHEN** build catalogs, release staging and scaffold packaging regenerate manifests
- **THEN** tested ranges with correct prerelease handling and optional-peer metadata survive, unbounded `*` ranges are rejected, Effect stays catalog-aligned, and independently versioned RELKIT packages retain their own versions

## ADDED Requirements

### Requirement: Consumer dependencies follow capability ownership
Required framework implementation SHALL remain normal dependencies. Application-owned optional SDKs SHALL be optional peers with compatible development dependencies for tests. Private dependencies always needed by a selected integration SHALL belong only to that integration. Tooling SHALL remain in tooling/development ownership; optional dependencies SHALL be reserved for genuine platform-installation semantics.

#### Scenario: Optional capability is absent
- **WHEN** a packed minimal or API consumer installs using a supported pinned package manager
- **THEN** unselected SDKs are not installed through peers, optional dependencies, bundles or compatibility re-exports

### Requirement: Isolation policies distinguish the two stage gates
Installation, evaluated JavaScript, consumed declarations and production artifacts SHALL be verified separately. Stage 1 SHALL permit only enumerated CLI legacy-inspector UI/history paths. Stage 2 SHALL remove every exception. Core, client and application observability SHALL remain outside those exceptions.

#### Scenario: An exception expands
- **WHEN** a dependency path introduces React through generic client, DuckDB through application observability, agents through inspector tooling or unrelated SDKs through CLI
- **THEN** both stage policies reject it even when a legacy CLI inspector path remains allowed

### Requirement: General consumer surfaces remain independently usable
Generic testing, root/server client, application authoring and runtime surfaces SHALL install and typecheck without unselected auth, database, agent or frontend implementations. Selected feature helpers SHALL retain their supported behavior through explicit optional entrypoints.

#### Scenario: Consumer typechecks packed declarations
- **WHEN** generic-client and minimal-test fixtures run with skipLibCheck false and only documented dependencies
- **THEN** declarations resolve without stubs, any-based substitutions or suppressions, and selected specialized fixtures still exercise their real dependencies

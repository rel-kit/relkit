## Purpose

Defines the reproducible workspace, dependency boundaries, and scope guardrails that every RelKit POC package and contributor workflow relies on.

## Requirements

### Requirement: Reproducible Bun workspace

The repository SHALL provide a private Bun workspace on TypeScript 7 whose committed lockfile, strict
shared TypeScript configuration, project references and root scripts produce the same install and
verification behavior from a clean checkout.

#### Scenario: Clean checkout succeeds

- **WHEN** a contributor runs `bun install --frozen-lockfile`, `bun run typecheck`, and
  `bun run verify` from a clean checkout with supported tool versions
- **THEN** all commands complete without hidden local setup or uncommitted generated changes

#### Scenario: Lockfile drift is rejected

- **WHEN** declared dependencies do not agree with the committed lockfile
- **THEN** frozen installation or the no-diff verification step fails with an actionable error

### Requirement: V3 workspace ownership

The workspace SHALL contain the public and internal package set, `apps/inspector`, `apps/docs`, `examples/commerce`, root acceptance tests, scripts, and default templates, with `apps/*`, `packages/*`, and `examples/*` registered as workspace cohorts and each package exposing an explicit supported entry point.

#### Scenario: Package export smoke test

- **WHEN** every workspace package is imported through its declared package export
- **THEN** supported imports resolve and imports of unexported internal source paths fail

#### Scenario: Canonical example is discovered

- **WHEN** a clean workspace install and task graph are evaluated
- **THEN** `examples/commerce` is treated as the one executable full-feature example and no duplicate fixture application remains

### Requirement: Enforced dependency direction

The repository SHALL automatically reject undeclared workspace dependencies, cross-package relative imports, lower-layer imports of higher-layer runtimes, and fixture/generated-application imports of internal Effect, Hono, Next.js, Pulumi, or RelKit implementation packages.

#### Scenario: Invalid descriptor dependency is caught

- **WHEN** a public descriptor package imports a runtime package
- **THEN** the package-boundary check fails before merge and identifies the importing and imported packages

#### Scenario: Valid dependency direction passes

- **WHEN** public descriptors depend only on allowed contract, schema, configuration, and diagnostic packages
- **THEN** the boundary check succeeds

### Requirement: Shared local and CI verification

Pull-request CI SHALL use the same frozen install, type checking, boundary checking, and ordered verification commands available to contributors locally.

#### Scenario: Pull request validation

- **WHEN** a pull request changes source, package metadata, tests, or generated artifacts
- **THEN** CI runs the documented root verification commands and blocks merge on any failure

### Requirement: Repository quality and guidance stay executable

The repository SHALL provide working format, lint, implementation-file-size, documentation/JSDoc, public-API, example, and structural checks, and SHALL keep `AGENTS.md` synchronized with the actual topology, ports, scripts, test availability, vendored-reference rules, and structural workflow.

#### Scenario: Workspace topology changes

- **WHEN** documentation and example workspaces replace prior topology
- **THEN** the same change updates `AGENTS.md`, contributor commands, task configuration, and automated checks so none describes removed paths as current truth

#### Scenario: Implementation exceeds a repository quality limit

- **WHEN** an implementation file exceeds 200 lines, required public API documentation is absent, formatting/lint fails, or behavior changes without its nearest README/spec/example update
- **THEN** verification rejects the change with the affected path and rule

### Requirement: Structural conventions are evidence-based

Directory, file, export, import, and naming conventions SHALL be configured only after the repository records their complete cohort and dominant pattern, validates the structural configuration, and reports audit violations separately from configuration validity.

#### Scenario: A structural convention is introduced

- **WHEN** Phase 0 has enough package-shell evidence to configure a convention
- **THEN** the evidence ratio, representative conforming and nonconforming paths, validation result, and unhidden audit findings are recorded without weakening the rule merely to reach zero violations

### Requirement: Recorded architecture decisions

The repository SHALL record the v3 decisions for function-only execution, internal-only Effect, generic event triggers, global providers, Pulumi-only deployment, AWS-first delivery, and warning-only source conventions.

#### Scenario: Architectural deviation is proposed

- **WHEN** an implementation changes one of the recorded decisions
- **THEN** reviewers can identify the conflict from the repository decision records before approving the change

### Requirement: Documentation and examples are workspace-owned

The documentation application and canonical examples SHALL be workspace packages with their own declared tasks and dependencies, while root scripts SHALL delegate orchestration through the workspace task graph.

#### Scenario: Documentation source changes

- **WHEN** guides, generated references, or documentation application source changes
- **THEN** the owning package's check/build tasks run and repository verification observes their outputs

#### Scenario: Example source changes

- **WHEN** the canonical commerce example changes
- **THEN** its declared check/type/test/build tasks participate in filtered and full workspace verification

### Requirement: Integrations are independently installable workspace packages

The workspace SHALL publish each integration — Redis, S3, Docker, local services, Cloudflare,
Postgres, agent adapters, Sentry, OTLP, AWS, Pulumi and deploy targets — as its own `@relkit/*`
package on the shared release version. Each SHALL own its exports, project reference, build, check and
test participation, public documentation, packed verification and maturity label. Integration
metadata SHALL live in `create-relkit`, not in a separate catalog package.

#### Scenario: Application installs only Redis

- **WHEN** it depends on `@relkit/redis`
- **THEN** package resolution and generated runtime output do not require S3, AWS, Pulumi, Sentry,
  OTLP, or their SDKs

#### Scenario: Application installs the catalog

- **WHEN** an application or tool needs the list of available integrations
- **THEN** it reads the metadata bundled with `create-relkit`, no `@relkit/integrations` package is
  installed, and selecting Redis uses `@relkit/redis` directly

### Requirement: Integration dependency direction is enforced

Core authoring, compiler, graph, engine, runtime, testing, CLI, and deployment-contract packages SHALL NOT depend on concrete integrations. Standalone integrations SHALL depend only on permitted core protocols and their selected implementation requirements. The catalog SHALL contain metadata without dependencies or executable re-exports that install integrations. Generated applications SHALL statically import selected standalone runtime exports.

#### Scenario: Core package imports an integration

- **WHEN** boundary validation finds a concrete integration dependency in core
- **THEN** repository checks fail without weakening structural allowlists

### Requirement: Static integrations do not create a plugin marketplace

RelKit SHALL allow branded descriptors to select installed package exports statically, but SHALL NOT accept user-authored runtime callbacks, arbitrary implementation paths, filesystem discovery, remote installation, automatic third-party discovery, or a plugin marketplace.

#### Scenario: Configuration names a filesystem runtime module

- **WHEN** an application attempts to load an integration by path
- **THEN** authoring or compilation rejects it before code execution

### Requirement: Repository topology guidance remains executable

Workspace manifests, TypeScript references, Turbo participation, boundary tests, package export smoke tests, public API/JSDoc checks, Konsistent validation/audit, package packing, changesets, and repository guidance SHALL cover the integrations workspace without exemptions for new package names.

#### Scenario: New integration package is added

- **WHEN** its package shell or entry barrel violates existing structural rules
- **THEN** normal repository checks fail and no wildcard rule is weakened to admit it

### Requirement: Jobs packages preserve optional integrations and safe dependency direction

Core authoring/runtime contracts SHALL remain separate from optional Inngest/Trigger/effect-mq implementations. Browser contracts SHALL import no server handlers, secrets, Effect or deployment SDKs. Task/job schema inference and legacy type exports SHALL resolve without cyclic jobs/functions implementation dependencies. All new exports/integrations SHALL participate in package metadata, declaration, packing and fixed release-cohort checks; no workflow/task-store package SHALL be introduced.

#### Scenario: Browser bundle is built

- **WHEN** a consumer imports generated jobs and client helpers
- **THEN** the bundle includes only safe contracts/helpers and no server/provider implementation

#### Scenario: App installs one provider

- **WHEN** an application uses only Inngest
- **THEN** core packages do not install Trigger or effect-mq SDKs

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

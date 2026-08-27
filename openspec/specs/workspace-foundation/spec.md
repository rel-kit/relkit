## Purpose

Defines the reproducible workspace, dependency boundaries, and scope guardrails that every RelKit POC package and contributor workflow relies on.

## Requirements

### Requirement: Reproducible Bun workspace

The repository SHALL provide a private Bun/TypeScript workspace whose committed lockfile, strict shared TypeScript configuration, project references, and root scripts produce the same install and verification behavior from a clean checkout.

#### Scenario: Clean checkout succeeds

- **WHEN** a contributor runs `bun install --frozen-lockfile`, `bun run typecheck`, and `bun run verify` from a clean checkout with supported tool versions
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

### Requirement: Explicit POC scope guardrails

The repository SHALL reject public APIs, graph node kinds, generated directories, inspector navigation, packages, or implementation phases for persistence models, identity models, workflow orchestration, knowledge stores, plugins or marketplaces, a separate subscription primitive, alternate infrastructure engines, or Rust components.

#### Scenario: Out-of-scope subsystem is introduced

- **WHEN** a change adds a forbidden subsystem artifact or obsolete public name covered by the scope scan
- **THEN** verification fails and reports the scope rule that was violated

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

## ADDED Requirements

### Requirement: Documentation and examples are workspace-owned

The documentation application and canonical examples SHALL be workspace packages with their own declared tasks and dependencies, while root scripts SHALL delegate orchestration through the workspace task graph.

#### Scenario: Documentation source changes

- **WHEN** guides, generated references, or documentation application source changes
- **THEN** the owning package's check/build tasks run and repository verification observes their outputs

#### Scenario: Example source changes

- **WHEN** the canonical commerce example changes
- **THEN** its declared check/type/test/build tasks participate in filtered and full workspace verification

## MODIFIED Requirements

### Requirement: V3 workspace ownership

The workspace SHALL contain the public and internal package set, `apps/inspector`, `apps/docs`, `examples/commerce`, root acceptance tests, scripts, and default templates, with `apps/*`, `packages/*`, and `examples/*` registered as workspace cohorts and each package exposing an explicit supported entry point.

#### Scenario: Package export smoke test

- **WHEN** every workspace package is imported through its declared package export
- **THEN** supported imports resolve and imports of unexported internal source paths fail

#### Scenario: Canonical example is discovered

- **WHEN** a clean workspace install and task graph are evaluated
- **THEN** `examples/commerce` is treated as the one executable full-feature example and no duplicate fixture application remains

### Requirement: Repository quality and guidance stay executable

The repository SHALL provide working format, lint, implementation-file-size, documentation/JSDoc, public-API, example, and structural checks, and SHALL keep `AGENTS.md` synchronized with the actual topology, ports, scripts, test availability, vendored-reference rules, and structural workflow.

#### Scenario: Workspace topology changes

- **WHEN** documentation and example workspaces replace prior topology
- **THEN** the same change updates `AGENTS.md`, contributor commands, task configuration, and automated checks so none describes removed paths as current truth

#### Scenario: Implementation exceeds a repository quality limit

- **WHEN** an implementation file exceeds 200 lines, required public API documentation is absent, formatting/lint fails, or behavior changes without its nearest README/spec/example update
- **THEN** verification rejects the change with the affected path and rule

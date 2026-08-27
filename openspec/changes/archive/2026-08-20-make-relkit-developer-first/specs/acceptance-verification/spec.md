## ADDED Requirements

### Requirement: Developer-first contract matrix

Acceptance SHALL cover every supported route method/segment/inference/override, uploads and limits, local/shared rate limits, typed callback events, config precedence, nested CLI help, OpenAPI/Scalar security, documentation search/generation, canonical examples, packaged development, and inspector accessibility.

#### Scenario: Public capability changes

- **WHEN** a public framework feature is added or modified
- **THEN** its owning focused tests, canonical commerce example, and user documentation change together before verification can pass

#### Scenario: Inference output changes

- **WHEN** route or event inference changes graph, OpenAPI, client, or registry output
- **THEN** deterministic type/compiler/integration goldens fail until the behavioral contract is deliberately reviewed

### Requirement: Documentation generation is deterministic

Generated API/CLI references, search data, and AI-readable documentation SHALL be reproducible, linked, and checked without hand edits, and public examples SHALL type-check and execute.

#### Scenario: Generated reference is stale

- **WHEN** public JSDoc or CLI metadata changes without regenerating its reference output
- **THEN** verification fails with the stale generated paths

#### Scenario: Documentation link or example breaks

- **WHEN** a guide contains a broken internal link or non-working executable example
- **THEN** documentation verification fails before release

### Requirement: Inspector accessibility and visual regression are focused

Browser acceptance SHALL cover semantic keyboard flows and a bounded set of representative responsive/theme visuals for the shell, resource table/sheet, graph, trace waterfall, and API reference rather than snapshotting every page.

#### Scenario: Critical inspector UI regresses

- **WHEN** a representative critical flow loses its accessible name, keyboard operation, redaction, responsive layout, or expected visual structure
- **THEN** focused browser acceptance fails

## MODIFIED Requirements

### Requirement: Packed and production-path acceptance

Release verification SHALL test packed packages and generator artifacts, the self-contained inspector, production builds/containers, real supervisor/browser flows, OpenAPI/Scalar protection, Pulumi preview, and an isolated AWS stack rather than relying solely on workspace links, mocks, or manual checks.

#### Scenario: Workspace tests pass but package is broken

- **WHEN** a packed package cannot generate, install, build, start development without a repository inspector path, serve the documented route/API reference, or shut down cleanly
- **THEN** release acceptance fails even if workspace unit tests passed

### Requirement: Documentation is executable evidence

Searchable getting-started, feature, CLI, testing, deployment, architecture, migration, and troubleshooting documentation SHALL match released APIs and commands and SHALL be followed verbatim on a clean environment as part of release acceptance.

#### Scenario: New developer flow is verified

- **WHEN** a reviewer uses only the documentation to create, test, inspect, use the API reference, build, preview, and clean up an application
- **THEN** each command and documented code example succeeds as written or the release gate is rejected

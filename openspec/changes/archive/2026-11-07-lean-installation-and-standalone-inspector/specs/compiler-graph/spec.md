## MODIFIED Requirements

### Requirement: Runtime integrations are statically planned

The compiler SHALL derive selected integration IDs and package exports from branded descriptors, emit deterministic static runtime references only for graph-required integrations, and reject application-authored import paths, duplicate registrations, package-root escapes, and protocol mismatches.

#### Scenario: Application contains a runtime import path

- **WHEN** an authored descriptor attempts to select an implementation by arbitrary module path
- **THEN** compilation fails before generating executable output

#### Scenario: One package offers several capabilities
- **WHEN** compilation selects only one advertised capability
- **THEN** the deterministic plan contains that capability's phase requirements and runtime references, not unrelated registrations or SDK imports

### Requirement: Complete snapshot invalidation

Snapshot reuse SHALL require equality of the relevant source and imported helper/asset inventory, configuration and inherited configuration, package/lockfile/patch identity, applicable dependency executable identity, compiler/runtime/protocol/tool versions, and supported platform. Additions, deletions, and content edits SHALL invalidate reuse even when timestamps are preserved. Inputs whose effects cannot be safely represented SHALL make the snapshot ineligible, causing full validation. Symbolic environment contracts SHALL be resolved and validated with current runtime values without persisting secrets.

#### Scenario: Helper changes or file is added or deleted

- **WHEN** a relevant file changes, appears, or disappears after preparation while other metadata remains unchanged
- **THEN** the next development attempt rejects snapshot reuse and validates the current complete source state before activation

#### Scenario: Dependency or configuration changes

- **WHEN** a lockfile, package, patch, dependency executable, config, inherited tsconfig, integration version, or supported tool/protocol identity differs
- **THEN** stale executable artifacts cannot be imported as a validated candidate and safe validation is required

#### Scenario: Configuration depends on uncaptured dynamic input

- **WHEN** compilation depends on undeclared environment, external filesystem, network, time, or randomness
- **THEN** preparation does not certify reuse of that result and development uses full validation

#### Scenario: Current runtime environment differs

- **WHEN** only symbolic runtime environment values differ while validated compilation inputs are unchanged
- **THEN** runtime environment validation still precedes readiness and no resolved value or secret digest is persisted in the snapshot

#### Scenario: Selected SDK disappears without a lockfile edit
- **WHEN** an installed selected dependency is removed or its actual supported version changes after preparation
- **THEN** startup revalidates selected requirements, rejects reuse before readiness and preserves the prior valid development generation

#### Scenario: Selection changes
- **WHEN** capability selection, requirement metadata or integration version changes
- **THEN** the preparation fingerprint changes and a deployment-only requirement does not become a runtime dependency

## ADDED Requirements

### Requirement: Requirement discovery precedes avoidable configuration evaluation
The compiler SHALL reuse declaration/import analysis to discover selected dependency requirements from explicit configuration, descriptors and integration declarations. It SHALL diagnose statically identifiable missing integration imports before eager evaluation where possible, without executing arbitrary configuration to enumerate hypothetical packages or introducing another full source parser.

#### Scenario: Configuration imports a missing integration
- **WHEN** an explicit configuration import can be resolved statically to an absent selected integration
- **THEN** the diagnostic identifies the source and required installation before avoidable configuration evaluation

#### Scenario: Dynamic configuration cannot be fully analyzed
- **WHEN** selection cannot be safely determined statically
- **THEN** normal controlled evaluation and its original failures remain visible without falsely certifying hypothetical requirements or silently installing packages

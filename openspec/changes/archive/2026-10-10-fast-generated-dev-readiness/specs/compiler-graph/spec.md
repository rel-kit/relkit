## ADDED Requirements

### Requirement: Portable validated development snapshot

Successful preparation SHALL produce a versioned development snapshot containing the complete checked graph and activation cohort, runnable entrypoint, route execution references, readiness contract, artifact digests, and validation-input fingerprint. Paths SHALL be project-relative and relocation-safe. Snapshot content SHALL contain no staging root, resolved secret, secret-derived fingerprint, live client, or closure serialized as data. Preparation SHALL preserve deterministic graph truth and explicit check/build/start contracts.

#### Scenario: Project root moves

- **WHEN** the project is renamed atomically after creation or moved to another absolute root with equivalent installed dependencies
- **THEN** validation accepts the snapshot and its runnable references resolve in the final project without old-root paths or another full check

#### Scenario: Preparation output is scanned

- **WHEN** preparation runs with synthetic secrets and a unique staging path
- **THEN** recursive artifact scans find neither resolved secret values nor the staging path

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

### Requirement: Snapshot integrity before execution

Persisted snapshots SHALL be decoded with bounded schema validation, path containment, version/cohort checks, and content integrity verification of all inventoried inputs and artifacts before accepting reuse or importing their executable startup closure. Deferred executable members SHALL be reverified before their first import against later mutation. Missing, corrupt, incompatible, mixed-generation, or path-escaping artifacts SHALL be rejected with safe diagnostics and use full validation. A declared hash SHALL not replace checking member content and cohort consistency.

#### Scenario: Cache is damaged or tampered with

- **WHEN** a graph, entrypoint, executable member, receipt, or plan is changed, truncated, omitted, or taken from another cohort
- **THEN** integrity or cohort verification rejects the snapshot before affected code executes or activates

#### Scenario: Receipt member hashes are changed inconsistently

- **WHEN** a modified receipt names different member hashes without matching input and cohort identity
- **THEN** the snapshot is rejected rather than treating supplied hashes as proof of validation

#### Scenario: Snapshot reference escapes the project

- **WHEN** persisted paths or symbolic links resolve outside allowed snapshot/dependency roots
- **THEN** validation refuses the reference before reading it as trusted executable content

### Requirement: Atomic snapshot publication and immutable execution

Preparation SHALL publish one complete validated snapshot atomically, retain the prior valid snapshot on failure, and bind execution to immutable generation-specific inputs. A changed input epoch SHALL prevent publication or activation of obsolete work. Concurrent publication and cancellation SHALL preserve exclusive temporary-file ownership and finalize acquired resources without deleting another writer's files or user-owned runtime state.

#### Scenario: Rapid edits overlap preparation

- **WHEN** a new source epoch arrives while an older candidate is being prepared
- **THEN** the older result cannot replace a newer accepted result and the latest source state is eventually validated

#### Scenario: Preparation is interrupted or a writer collides

- **WHEN** interruption or exclusive publication failure occurs
- **THEN** owned temporary output is finalized, the prior complete snapshot remains valid, and another writer's output is untouched

#### Scenario: Working tree changes after startup

- **WHEN** a delayed route implementation is loaded by an already active generation after source edits
- **THEN** it loads verified immutable content from that generation rather than unvalidated working-tree source

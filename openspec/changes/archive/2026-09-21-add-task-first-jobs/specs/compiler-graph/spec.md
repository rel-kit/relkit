## ADDED Requirements

### Requirement: Task discovery and binding are deterministic

Compilation SHALL discover task source/export identity and nested service members without executing handlers, deduplicate descriptor re-exports, validate task/job/name/reference/schema ownership, and resolve exactly one implicit or designated direct binding. New tasks SHALL not become generated function targets. Public/private name collisions, wrong-task selectors, missing versions, missing services and unsupported policies SHALL fail before activation.

#### Scenario: Equal durable IDs

- **WHEN** one task and its job both use orders.export
- **THEN** both compile without collision and graph lookup distinguishes them without changing either durable ID

#### Scenario: Schema indexes have equal durable IDs

- **WHEN** a function, task and job share a permitted durable ID but have different caller/canonical schema contracts
- **THEN** all schema projections and hashes remain attached to their correct executable, including after evaluator serialization and reordered discovery

#### Scenario: Nested schema transforms are compiled

- **WHEN** transforms/refinements occur inside object, array, union or optional/default schemas
- **THEN** faithful caller/canonical projections and validators survive compilation, or a source diagnostic rejects an unsupported projection without executing defaults to guess its shape

#### Scenario: Alias order changes

- **WHEN** identical descriptors are exported through different discovery orders
- **THEN** the canonical name-to-ID mapping and manifest hashes are unchanged

#### Scenario: Invalid candidate follows working build

- **WHEN** new task source fails validation
- **THEN** diagnostics update and the complete last-known-good jobs/HTTP cohort remains active

#### Scenario: Task lifecycle hooks are inspected

- **WHEN** a task declares onStart, onSuccess and onFailure
- **THEN** its graph contains task-owned start/success/failure hook nodes and uses-hook edges with distinct stable graph IDs, without changing existing function/tool before/after hooks

### Requirement: Build and public fingerprints preserve compatibility

Worker executable code/dependencies/schema/adapter semantics SHALL determine immutable build identity independently of task semantic version and job API name. Name-only change with pinned ID SHALL affect public contract identity without replacing native durable identity. Wait/schema changes under the same semantic version SHALL be diagnosed where detectable; existing accepted work SHALL remain pinned regardless of current source.

#### Scenario: No-op compilation

- **WHEN** configuration and executable content are unchanged
- **THEN** build IDs, native registrations and schedule ownership remain unchanged

#### Scenario: First explicit binding replaces implicit job

- **WHEN** a task gains its first explicit job
- **THEN** only the explicit binding receives new submissions and historical implicit locators remain routable

### Requirement: Replay diagnostics are advisory and actionable

Compilation SHALL warn about statically identifiable unstable wait keys/order and potentially repeated external work before durable waits, naming the source and replay-safe remediation. Advisory analysis SHALL not claim to prove idempotency or reject arbitrary business code solely on that heuristic; detectable incompatible wait/schema changes SHALL retain their existing hard compatibility diagnostics.

#### Scenario: Unstable key is statically visible

- **WHEN** a durable task derives a wait key from current time or randomness
- **THEN** it receives an actionable replay warning, while an accepted-input-derived stable key has no such warning

## MODIFIED Requirements

### Requirement: Structured portable diagnostics

Compiler diagnostics SHALL include stable code, severity, message, optional project-relative location and descriptor ID, related locations, suggestion, and documentation path, and SHALL be available to terminal, JSON consumers, the inspector, the compiler API, and supported CI annotation adapters.

#### Scenario: Duplicate ID is reported

- **WHEN** two distinct descriptors use the same stable ID within a namespace that requires uniqueness
- **THEN** `RELKIT_DUPLICATE_ID` identifies both project-relative source locations

### Requirement: Complete serializable application model

The graph SHALL retain all existing application/domain/function/trigger/event/resource/agent/provider relationships and additionally represent tasks, task-target jobs, names versus durable IDs, implicit/default bindings, semantic/build versions, supported policy, schedule, exposure, and declared/observed triggering relationships. Equal task and job durable IDs SHALL have distinct graph identities. No closures, resolved environment, credentials, live clients or accepted run payloads SHALL enter the graph.

#### Scenario: Graph is inspected as JSON

- **WHEN** a full fixture graph is recursively inspected
- **THEN** every required provider binding and relationship is present, all content is JSON-safe, and no resolved environment or credential value appears

#### Scenario: Bucket profile is reused

- **WHEN** normalization finds multiple bucket descriptors linked to one profile
- **THEN** compilation emits a deterministic error before graph activation

### Requirement: Deterministic generated artifacts

Compilation SHALL retain existing application.graph.json, runtime.manifest.ts, diagnostics, HTTP/client/event registry and requested deployment artifacts and add the versioned jobs.manifest.json in .relkit/generated, task/job executable references, generated jobs client registry and native worker entries. Outputs SHALL use deterministic bytes, normalized paths, version/hash validation and atomic content-aware writes; jobs and their bindings SHALL activate in the same verified cohort.

#### Scenario: Unchanged source is recompiled

- **WHEN** generated content is byte-identical to existing output
- **THEN** the compiler leaves file contents and modification state unchanged

#### Scenario: Registry content changes

- **WHEN** the known event set changes
- **THEN** only changed generated artifacts are atomically replaced and no partial registry is observable

#### Scenario: Invalid source follows a valid compile

- **WHEN** compilation fails after a valid generated artifact set exists
- **THEN** diagnostics update while the last valid graph and activatable artifacts remain unchanged

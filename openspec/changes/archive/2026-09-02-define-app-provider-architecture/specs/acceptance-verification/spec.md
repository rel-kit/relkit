## ADDED Requirements

### Requirement: Provider architecture has layered cohort evidence

Acceptance SHALL combine type tests, protocol and normalization unit tests, compiler determinism and stale-artifact tests, runtime lifecycle and explicit-replacement tests, generated-project smoke tests, integration package packing, Docker integration tests, deployment plan/mocks, Inspector tests, and full repository verification.

#### Scenario: Contract cohort is partially stale

- **WHEN** graph, manifest, runtime-integration plan, local-service plan, deployment plan, or override generation does not match the expected fingerprint
- **THEN** the relevant build, runtime, supervisor, Inspector, and deployment tests prove rejection before activation or mutation

### Requirement: Local service isolation has executable evidence

Tests SHALL cover separate profiles, required-only startup, all-binding startup, `--local=off`, pinned recipe health, random loopback ports, hot-reload reuse, changed-plan reconciliation, detached adoption, stop/reset protection, worktree isolation, stale-lease recovery, secure state, and secret-free output.

#### Scenario: Docker integration suite is opted in

- **WHEN** `RELKIT_TEST_DOCKER=1` enables Redis and MinIO tests
- **THEN** real containers prove health, persistence, isolated outputs, cleanup, and bounded failure behavior

### Requirement: Telemetry and documentation are release evidence

Acceptance SHALL prove complete redacted Inspector persistence despite export sampling, independent Sentry/OTLP failure behavior, CloudWatch host routing, executable examples, generated API/CLI reference freshness, search/link correctness, docs build, landing accessibility/responsiveness, and visual inspection of changed product surfaces.

#### Scenario: External exporter drops a trace

- **WHEN** export sampling or failure prevents remote delivery
- **THEN** tests still find the complete redacted local timeline and safe exporter diagnostic in Inspector

### Requirement: Cloud acceptance remains separately authorized

Local implementation gates SHALL use pure plan tests, Pulumi mocks, generated-program tests, and containers; paid or mutating cloud acceptance SHALL remain a separately authorized release gate and completion of this change SHALL NOT constitute final cloud release approval.

#### Scenario: Implementation verification runs without cloud authorization

- **WHEN** the change reaches local completion
- **THEN** no paid cloud resource is created and required release-gate cloud evidence remains explicitly outstanding

## REMOVED Requirements

### Requirement: Phases map one-to-one to review gates

**Reason**: The provider architecture uses eleven bounded gates rather than the previous fixed phase map.

**Migration**: Track the granular task groups in this change; only predecessor baseline reconciliation is independently mergeable and the new contract cohort completes together.

#### Scenario: One implementation gate is reviewed

- **WHEN** evidence is attached to its bounded tasks
- **THEN** reviewers can verify its inputs, outputs, rejection conditions, tests, and cohort dependencies

### Requirement: Generated and migrated applications prove the new workflow

**Reason**: This pre-1.0 clean break intentionally provides no compatibility or migration workflow.

**Migration**: Update repository-owned examples and templates directly and verify newly generated projects; old projects must be rewritten and regenerated.

#### Scenario: Legacy fixture is encountered

- **WHEN** it uses removed provider APIs or old artifacts
- **THEN** validation fails with rewrite or regeneration guidance rather than transforming it

### Requirement: Fresh implementation tasks have durable handoffs

**Reason**: Task execution belongs to the active Codex task; a repository policy must not require a particular model, delegated task, or orchestration skill.

**Migration**: Keep durable progress, decision, blocker, task, and verification evidence in the change artifacts without prescribing how the active task is executed.

#### Scenario: Another implementation unit remains

- **WHEN** a verified checkbox completes and another bounded unit is pending
- **THEN** the current task may continue using the recorded repository evidence without dispatching another task

### Requirement: Ownership and credential isolation are verified

**Reason**: External/managed ownership has been replaced by connected, local-only, and infrastructure sources.

**Migration**: Verify source lifecycle isolation, binding-local values, infrastructure access operations, and absence of connected-resource mutations under the new contract.

#### Scenario: Connected resource is planned

- **WHEN** deployment verification inspects it
- **THEN** no lifecycle or implicit access operation exists and unrelated credentials remain unavailable

### Requirement: Scope integrity remains enforced at release

**Reason**: The former blanket plugin prohibition conflicts with trusted statically installed integration modules.

**Migration**: Enforce the static integration boundary while retaining prohibitions on callbacks, arbitrary paths, discovery, remote installation, and marketplaces.

#### Scenario: Dynamic plugin behavior is proposed

- **WHEN** verification detects runtime callbacks, path loading, discovery, or remote installation
- **THEN** release scope fails even if static integrations otherwise pass

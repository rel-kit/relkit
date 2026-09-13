## ADDED Requirements

### Requirement: TJ-041 Regression and native evidence

Supported capabilities MUST reference passing native and failure-recovery tests, and existing Relkit verification MUST remain green.

#### Scenario: Regression and native evidence

- **WHEN** an SDK, backend or image version changes
- **THEN** its affected native/recovery fixtures must pass before the capability is promoted as supported

### Requirement: Native semantics and fault matrix gate release

Every advertised native capability SHALL reference passing pinned native and restart/failure evidence. This change's F01–F28 matrix, complete type/schema/naming/provider fixtures and deterministic controller/property cases SHALL be executable. Mocks alone SHALL not certify durability, retries, sleep, concurrency, cleanup, scheduling or version routing. Coverage SHALL target at least 90 percent of new validation/binding/watch branches with mutation checks for tenant guards, abort cleanup, stale epochs, duration conversion and retry multiplication.

The RG01–RG13 review regressions in design §18.9 SHALL also have evidence in their designated suites. Native semantics SHALL use real native fixtures; whole-application discovery/uniqueness SHALL use compiler fixtures rather than isolated TypeScript assertions.

#### Scenario: A supported feature has no evidence

- **WHEN** a capability report marks native or adapter support without a passing applicable fixture
- **THEN** release validation fails

#### Scenario: Crash fixture is mocked

- **WHEN** sleep recovery is tested only by throwing a JavaScript exception
- **THEN** native certification remains incomplete until the required process/container failure test passes

#### Scenario: Review gap has no executable evidence

- **WHEN** a completed checklist claims a review regression is covered only by planning prose or the wrong test layer
- **THEN** the completion audit remains incomplete until the designated behavior is exercised

### Requirement: Release distinguishes core readiness from full provider completion

Core readiness SHALL require task/job APIs, deterministic binding, Inngest account-free durable tasks plus native scheduling, typed secure clients, bounded Inspector, migration/docs/scaffold and relevant restart/security/package tests. Full milestone completion SHALL additionally require all three requested executable integrations and each advertised deployment subset's evidence. Unavailable cloud credentials SHALL mean not tested, not passed; billable acceptance SHALL require isolated explicitly authorized credentials and budget.

#### Scenario: Third adapter is only a factory

- **WHEN** core checks pass but one requested integration cannot deploy executable tasks
- **THEN** the full change remains incomplete

#### Scenario: Hosted credentials absent

- **WHEN** local tests pass without managed-provider credentials
- **THEN** hosted support stays unverified and no billable test is attempted

### Requirement: Verification preserves the repository release path

Focused jobs suites SHALL be wired into existing test orchestration, verification, prepush, docs/reference and packed scaffold/CI checks. Existing functions/events/agents/storage/cache/local-service/deployment boundaries SHALL remain covered. Controller/load fixtures SHALL include 100 unique watches, 1000 shared observers and 10000 create/dispose cycles with bounded metrics; native quota-aware sizes SHALL be recorded rather than claimed as universal throughput.

#### Scenario: Observer lifecycle stress runs

- **WHEN** the declared fixture completes repeated connect/disconnect/dispose and Strict Mode cycles
- **THEN** resource counts return to baseline within the cleanup bound and retained state stays scope-correct

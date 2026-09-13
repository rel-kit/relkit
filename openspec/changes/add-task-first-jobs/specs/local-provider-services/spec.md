## ADDED Requirements

### Requirement: TJ-032 Account-free Docker jobs

The release MUST include a clean-machine Docker quickstart requiring no external provider account or token.

#### Scenario: Account-free Docker jobs

- **WHEN** a fresh project with supported local tools runs the Inngest Docker quickstart
- **THEN** it triggers, sleeps, survives restart, retrieves output and appears in Inspector without any hosted account or token

### Requirement: TJ-033 Compatible composite recipes

Jobs recipes MUST reuse/extend existing local-service ownership and preserve storage/cache behavior.

#### Scenario: Compatible composite recipes

- **WHEN** legacy single-container storage/cache recipes and composite jobs recipes run together
- **THEN** up/status/stop/reset respects resource ownership and ordinary shutdown preserves volumes

### Requirement: TJ-035 Account-free scheduling path

The release MUST include at least one certified local Docker scheduling service alongside the minimal durable task recipe.

#### Scenario: Account-free scheduling path

- **WHEN** a user with no hosted credentials runs the local recurring cleanup example
- **THEN** the Inngest Docker scheduler creates new runs and preserves recurrence through restart

### Requirement: Composite jobs services preserve local ownership and readiness

Composite recipes SHALL declare a validated dependency DAG, health, init/migrations, persistent volumes, generated secrets, network/ports, worker builds, outputs and stable ownership. V1 single-container recipes SHALL remain compatible. Startup SHALL follow dependency health then one locked migration/init, worker publication/registration, native acceptance/read readiness and cohort activation. Unsupported recipes SHALL fail without partial activation.

#### Scenario: Dependency graph invalid

- **WHEN** a recipe contains cycles, unknown unit references or leaked secret output
- **THEN** planning fails before starting containers

#### Scenario: Two projects start simultaneously

- **WHEN** two projects use the same jobs provider and application ID
- **THEN** random ports and project-scoped ownership prevent adoption, migration or reset of each other's resources

### Requirement: Shutdown and hot reload retain durable jobs

Ordinary dev/local shutdown SHALL stop admission, release or complete owned work with bounded grace and preserve native volumes, keys, schedules and waiting runs. New source SHALL create an immutable worker build while old active/sleeping work keeps its compatible worker generation. Unsafe concurrent build routing SHALL block hot swap. Reset SHALL preview owned affected runs/schedules/volumes and require confirmation unless the existing explicit --yes override is supplied; --dry-run SHALL return the impact without mutation.

#### Scenario: Old run sleeps during reload

- **WHEN** a developer saves changed task code while a run is parked
- **THEN** the old run resumes its old build or activation waits for an explicit drain

#### Scenario: Reset finds foreign resources

- **WHEN** containers with another project's ownership labels exist
- **THEN** reset leaves them untouched

### Requirement: Account-free recipes have honest persistence and resource isolation

The default durable recipe SHALL use Inngest with persisted native dependencies and workers without hosted credentials; effect-mq SHALL use a recipe-owned PostgreSQL native store for retryable jobs, and Trigger Docker SHALL have separate certification. Images/digests/architectures and native durability windows SHALL be recorded. Task resource minima SHALL constrain isolated execution workers, not only their databases/control planes. Native administrative ports SHALL default to loopback and task code SHALL not receive unrestricted Docker socket access.

#### Scenario: Abrupt store stop

- **WHEN** the engine and persisted dependencies are forcibly stopped after acceptance
- **THEN** recovery matches the certified acknowledgement durability, without switching to memory

#### Scenario: Resource-bound task

- **WHEN** a task requires isolated CPU/memory
- **THEN** actual execution allocation and reported class agree under load and memory exhaustion

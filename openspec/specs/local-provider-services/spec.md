# Local Provider Services Specification

## Purpose

Defines deterministic and secure local integration services whose lifecycle is owned by RelKit development tooling without changing build, production runtime, or deployment behavior.

## Requirements

### Requirement: Local service plans are deterministic and side-effect free

Compilation and `relkit check` SHALL produce a versioned local-service plan from binding descriptors without contacting Docker or starting services; equivalent applications SHALL produce identical plan bytes and hashes.

#### Scenario: Application is checked without Docker

- **WHEN** a developer runs `relkit check` on an application with Docker-backed bindings and Docker is unavailable
- **THEN** static validation and plan generation complete without starting or probing a container engine

### Requirement: Local commands start only their declared scope

`relkit dev` SHALL reconcile only graph-required local bindings, `relkit local up` SHALL reconcile all declared local bindings, and `relkit dev --local=off` SHALL start none. Build, start, test without integration opt-in, and deployment SHALL ignore local-service recipes.

#### Scenario: Unused local binding exists

- **WHEN** development starts and the active graph does not require one declared Docker binding
- **THEN** that binding remains stopped while required bindings become healthy

### Requirement: Default recipes are pinned and health checked

Redis SHALL use a pinned Redis-compatible image with loopback-only random host port, preserved named volume, and `PING` readiness; S3 SHALL use a pinned MinIO-compatible image with loopback-only random ports, generated local credentials, preserved data volume, and protocol health readiness.

#### Scenario: Redis local service becomes ready

- **WHEN** `docker(redis())` is required by development
- **THEN** tooling waits for a successful Redis health check before publishing the binding-local URL and starting the candidate runtime

### Requirement: Local resources use stable scoped identity

Managed local resources SHALL be labeled with stable application ID, local project ID, binding ID, recipe ID, and plan hash. Local project identity SHALL derive from the canonical project root plus application ID so clones and worktrees cannot adopt each other's resources.

#### Scenario: Two worktrees use one application ID

- **WHEN** both worktrees run local services concurrently
- **THEN** each reconciles only resources carrying its distinct local project identity

### Requirement: Reconciliation preserves healthy unchanged services

Development reloads SHALL reuse healthy services whose recipe and plan hash remain compatible, reconcile only changed bindings, publish a new override generation after health succeeds, and preserve volumes across ordinary attached-session shutdown.

#### Scenario: Application source changes without a local-plan change

- **WHEN** a new backend candidate is compiled
- **THEN** its existing healthy local containers and binding outputs are reused without restart

### Requirement: Session ownership is coordinated by recoverable leases

One attached development session SHALL own a project lease; detached services SHALL be adoptable; live leases SHALL prevent conflicting stop, reset, or attached-session operations; and stale leases from dead processes SHALL be recoverable without affecting another active project.

#### Scenario: Stop is requested during active development

- **WHEN** `relkit local stop` targets services owned by a live attached session
- **THEN** the command refuses with the owning session identity and changes no container or state

#### Scenario: Development process crashes

- **WHEN** the recorded lease owner no longer exists
- **THEN** the next local command safely recovers the lease and reconciles labeled resources

### Requirement: Binding outputs are stored securely

Local state SHALL use project-contained paths, restrictive directory and file permissions where supported, temporary-file plus atomic-rename writes, symlink and path-escape rejection, and no secret values in logs, diagnostics, process arguments, graph artifacts, or Docker labels.

#### Scenario: Override generation is written

- **WHEN** a healthy recipe produces credentials or connection values
- **THEN** tooling writes them only to the binding-scoped secure override state and records a non-secret generation identity for activation

### Requirement: Candidate activation includes local state identity

Development SHALL start a candidate only after its required services are healthy and SHALL switch the proxy only when readiness reports the expected graph, manifest, runtime-integration, local-service, and provider-override generation identities.

#### Scenario: Override belongs to an older local plan

- **WHEN** a candidate reports an override generation associated with another local-service plan hash
- **THEN** the supervisor rejects activation and keeps the last-known-good generation serving traffic

### Requirement: Local event and job providers are public integrations

`@relkit/local` SHALL expose side-effect-free `localEvent()` and `localJob()` authoring adapters and SHALL register matching runtimes backed by the existing durable filesystem event and job provider implementations.

#### Scenario: Local event profile is compiled and run

- **WHEN** an application binds an event profile with `localEvent()`
- **THEN** compilation resolves the integration metadata and runtime activation uses the durable local event provider for the profile's stable scope

#### Scenario: Local unscheduled job profile is compiled and run

- **WHEN** an application binds an unscheduled job with `localJob()`
- **THEN** runtime activation registers the existing local job queue implementation without claiming scheduler support

### Requirement: Scaffolded local runtime state is explicit

Generated local event and job profiles SHALL use named, project-scoped filesystem state and SHALL not start processes, invoke jobs, or erase state during scaffolding.

#### Scenario: Full service creates local profiles

- **WHEN** a full service bundle needs fallback event and job providers
- **THEN** source configuration declares deterministic local profiles and next steps explain their state requirements without performing runtime work

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

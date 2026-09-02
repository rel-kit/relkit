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

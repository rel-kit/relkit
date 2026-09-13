## ADDED Requirements

### Requirement: Scaffolding discovers and reuses compatible profiles

Add planning SHALL inspect canonical application and source declarations to discover services, public members, events, tools, prompts, model profiles, and compatible provider profiles. A unique or configured compatible profile SHALL be reused before a documented first-party default is created.

#### Scenario: Compatible cache profile exists

- **WHEN** a cache is added and the application has one compatible configured cache profile
- **THEN** the new cache uses that profile without adding a duplicate integration or profile

### Requirement: First-party profile edits remain secret-safe

The CLI SHALL scaffold only known first-party cache, bucket, event, job, and model integrations. It SHALL merge imports, profile maps, defaults, environment declarations, blank `.env.example` entries, dependencies, and scripts without resolving or writing secret values. AWS-backed options SHALL be offered only when AWS with Pulumi deployment is already declared.

#### Scenario: Docker cache default is selected

- **WHEN** cache configuration is otherwise unresolved
- **THEN** the plan adds a Docker-backed Redis profile, required package/script declarations, and a warning to start local services

#### Scenario: Connected provider needs a credential

- **WHEN** a connected first-party provider profile is created
- **THEN** the source references a named environment value and `.env.example` contains only a blank placeholder

### Requirement: Resource provider choices are constrained and deterministic

Cache scaffolding SHALL support discovered profiles, Redis from Docker, connected Redis, Redis on existing AWS/Pulumi, and connected Cloudflare KV. Bucket scaffolding SHALL support discovered profiles, S3 from Docker, connected S3, S3 on existing AWS/Pulumi, and connected Cloudflare R2. File-backed RELKIT profiles SHALL be the fallback for events and jobs.

#### Scenario: Unsupported provisioning source is requested

- **WHEN** AWS is requested without an existing AWS/Pulumi deployment declaration
- **THEN** planning returns a usage failure before files or package metadata are changed

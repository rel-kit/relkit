## MODIFIED Requirements

### Requirement: Documentation teaches the complete integration workflow

Task-oriented guides SHALL use executable canonical sources to explain `defineApp`, handler-visible environment values, binding-local named values, direct/profile bindings, connected adapters, `docker(adapter)`, infrastructure wrappers, explicit test replacements, local commands, mixed-provider deployment, and release-source diagnostics.

#### Scenario: Developer learns docker Redis

- **WHEN** a reader follows the local integration guide
- **THEN** it demonstrates `docker(redis())`, `docker(redis({ url }))`, `dev --local=off`, health behavior, persistence, and the fact that Docker never participates in deployment

#### Scenario: Developer configures two cache servers

- **WHEN** a reader needs separate request and timeline caches
- **THEN** the guide uses two physical profiles and explains logical cache profile selection separately from request-derived rate-limit keys

#### Scenario: Reader selects an integration
- **WHEN** a guide introduces a capability
- **THEN** it starts with actual packages, tested ranges and install sections from shared metadata, then executable standalone imports/configuration and missing/incompatible dependency guidance

### Requirement: Documentation teaches telemetry and Inspector together

Observability and Inspector guides SHALL explain redaction, bounded capture, independent history ownership, enable/install/run separation, external sampling, concurrent Sentry/OTLP exporters and CloudWatch host routing. They SHALL disclose loss before connection, gaps and incomplete history without promising persistence when no tool runs.

#### Scenario: Export sampling is configured

- **WHEN** a reader lowers the external trace sample rate
- **THEN** the guide states and demonstrates that retained Inspector logs and traces remain available independently of sampling when the tool stores them, with buffer/overflow/absence limits disclosed

### Requirement: Landing page presents local-to-cloud integrations

The existing landing page SHALL reuse its component and visual system while presenting an executable `defineApp` example, concise standalone executable imports and metadata-only catalog guidance, `docker(redis())` behavior, `aws(s3())` local-to-cloud behavior, and Inspector telemetry visibility with links to the corresponding guides.

#### Scenario: New developer evaluates RelKit

- **WHEN** the landing page is rendered on desktop or narrow viewport
- **THEN** the developer can understand the local-first workflow, how deployment ownership differs from connected services, and where to learn about integrations and Inspector without encountering removed APIs

## ADDED Requirements

### Requirement: Inspection guidance describes independent operation
Guides, CLI/config reference, templates, READMEs, examples and repository-owned distributed skills SHALL explain disabled defaults; bridge enablement; explicit tool installation/run; UI versus bridge addresses; tool runtimes; session selection; production exclusion; bounded capture and preserved history. No normal guide SHALL promise a bundled inspector from default dev.

#### Scenario: User follows lean and inspected examples
- **WHEN** a packed consumer follows the lean backend example then the explicitly inspected example
- **THEN** backend development works first without UI/store and inspection works only after the documented separate actions

### Requirement: Docker guidance is executable and credential safe
Docker guides SHALL cover local image build and version contract, Desktop/Linux host access and private networks, explicit reachable binding/target, restricted mounts, file credentials, directory-based discovery rotation and persistent project-owned history. Public availability SHALL be claimed only after authorized publication.

#### Scenario: Host app retains a loopback-only bridge
- **WHEN** a reader configures container access
- **THEN** guidance explains that a host alias alone is insufficient and supplies explicit binding, credential and network restrictions without broad mounts or command-line tokens

### Requirement: Distribution guidance follows authoritative producers
Affected source documentation, command metadata, examples, canonical skills and template copies SHALL agree with shared requirement metadata and package versions. API/CLI references and copied output SHALL regenerate through existing producers. Existing data, Drizzle repair and selected frontend examples SHALL remain intact.

#### Scenario: Regeneration runs after package ownership changes
- **WHEN** documentation, scaffold and release producers regenerate
- **THEN** outputs retain optional-peer metadata and selected imports, no umbrella dependency is restored and registered packages participate in normal checks without exemptions

## ADDED Requirements

### Requirement: Default generated projects are cloud free

Both creation entry points SHALL default to no cloud host and no deployment engine, SHALL omit AWS and Pulumi packages and configuration, and SHALL start the default route without Docker or cloud credentials. Explicit cloud and deployment options SHALL add only their selected integration packages and declarations.

#### Scenario: Default API project is generated

- **WHEN** a developer accepts all defaults
- **THEN** the project can install, check, test, build, and run locally without Docker, AWS, Pulumi, or cloud environment values

#### Scenario: AWS and Pulumi are selected

- **WHEN** generation receives `--cloud aws --deploy pulumi`
- **THEN** the project imports `@relkit/aws` and `@relkit/pulumi` and includes their deployment declaration

### Requirement: Local service commands are explicit

The CLI SHALL provide `local up`, `local status`, `local stop`, and `local reset`, detached startup where requested, and `dev --local=off`; command output SHALL identify bindings and health without printing credentials or resolved secret values.

#### Scenario: Developer starts all local services detached

- **WHEN** `relkit local up --detach` succeeds
- **THEN** all declared local bindings remain running, become adoptable by a later development session, and are reported without secrets

### Requirement: Doctor validates integrations and local prerequisites

Doctor SHALL validate installed selected integration exports and protocols, required binding value names, Docker availability only when local execution is requested, source compatibility, duplicate identities, and deployment-role compatibility without executing unselected integration code or resolving secrets.

#### Scenario: Docker is unavailable for local development

- **WHEN** a required Docker-backed binding is checked for `relkit dev`
- **THEN** doctor reports the binding and Docker prerequisite without silently using its remote source

## REMOVED Requirements

### Requirement: Project creation entry points and defaults

**Reason**: The previous defaults include Pulumi/AWS and the removed external/managed provider topology.

**Migration**: Regenerate or update projects to `defineApp`; select AWS/Pulumi explicitly when required.

#### Scenario: Previous generator defaults are assumed

- **WHEN** a golden or caller expects implicit AWS/Pulumi output
- **THEN** generator verification reports the new cloud-free default

### Requirement: Generated application stays on public APIs

**Reason**: The old requirement teaches removed ownership wrappers and does not enforce minimal standalone integration imports.

**Migration**: Generate `defineApp` source importing only selected `@relkit/<integration>` packages.

#### Scenario: Generated source uses legacy provider imports

- **WHEN** a template contains `external`, `managed`, or old provider package imports
- **THEN** packed-artifact verification fails

### Requirement: Doctor validates provider references safely

**Reason**: Doctor now validates binding-local values, integration identities, sources, and local-service prerequisites rather than external/managed adapter references.

**Migration**: Use the new integration and local diagnostics; resolved secrets remain prohibited.

#### Scenario: Legacy ownership diagnostic is expected

- **WHEN** tooling receives an old provider descriptor
- **THEN** it reports the unsupported contract version instead of evaluating it


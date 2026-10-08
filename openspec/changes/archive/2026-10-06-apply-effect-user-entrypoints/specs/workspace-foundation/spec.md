## ADDED Requirements

### Requirement: Shared dependency versions have one authoritative definition

Shared external dependency pins and intentionally supported peer ranges SHALL have one authoritative workspace definition. Workspace installation, compatibility checks, release staging, and scaffold generation SHALL resolve those definitions consistently and reject missing references.

#### Scenario: A shared version changes

- **WHEN** a contributor changes one authoritative shared dependency pin and regenerates derived metadata
- **THEN** every participating workspace, packaged manifest, and generated standalone project uses the corresponding resolved version without an additional manual pin change

#### Scenario: A reference is missing

- **WHEN** a dependency references an absent catalog or entry
- **THEN** installation or validation fails with the dependency and missing reference identified

#### Scenario: Published package is consumed outside the workspace

- **WHEN** a consumer installs a packed package in a clean standalone directory
- **THEN** its external dependency declarations are concrete versions or supported peer ranges and require no original workspace catalog or path

#### Scenario: Peer compatibility is retained

- **WHEN** an intentionally broad supported peer range is packed
- **THEN** it retains that supported range rather than narrowing to the workspace's development version

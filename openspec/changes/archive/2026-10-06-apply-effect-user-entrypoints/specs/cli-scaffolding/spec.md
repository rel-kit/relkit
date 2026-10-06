## MODIFIED Requirements

### Requirement: Shared project creation workflow

`create-relkit` and `relkit create` SHALL resolve the same name, destination, template, cloud, deployment, examples, install, and Git choices and SHALL invoke the same staged generator. Interactive creation SHALL ask only for a missing project name and final confirmation, default to minimal with cloud, deployment, and jobs disabled, and retain explicit supported flags. Further artifact customization SHALL use the existing add commands after creation.

#### Scenario: Equivalent create entrypoints are used

- **WHEN** both entrypoints receive equivalent choices
- **THEN** their normalized generated projects are byte-identical

#### Scenario: Headless customization is needed

- **WHEN** automation creates a project non-interactively
- **THEN** it can perform customization through subsequent `relkit add` commands without an encoded recipe format

#### Scenario: Interactive defaults are accepted

- **WHEN** a developer creates a project interactively without advanced flags
- **THEN** creation asks for a missing name and final confirmation, creates the minimal project, and does not ask for an application format or repeated staged additions

## ADDED Requirements

### Requirement: Required dependency repairs are portable and transactional

When a selected scaffold needs a compatibility repair, generation and add SHALL deliver the repair asset and its relative manifest registration before installation. Add SHALL preserve unrelated registrations, reuse byte-identical assets, reject conflicting registrations or assets before mutation, and snapshot the manifest, repair asset, and lockfile. A repair-only change SHALL trigger installation when installation is enabled.

#### Scenario: Packed generator selects a repaired dependency

- **WHEN** a clean standalone application selects a dependency requiring a repair through a packed generator or add command
- **THEN** installation applies the packaged repair without accessing repository source or prepatched workspace dependencies

#### Scenario: Repair conflicts with an existing asset

- **WHEN** the requested repair path or registration contains differing existing content
- **THEN** the operation reports a collision without overwriting existing content

#### Scenario: Repair-only installation fails

- **WHEN** the dependency already exists but a new repair is required and installation or validation fails
- **THEN** the repair, manifest, and lockfile return to their original bytes while unrelated edits remain intact

# user-facing-text Specification

## Purpose
Defines how RelKit communicates with developers in the README, docs, CLI output, error messages and
changelog, so every message is plain, consistent and actionable.

## Requirements

### Requirement: One product name

User-facing text SHALL spell the product name "RelKit" and SHALL NOT use other spellings outside
code identifiers, package names and command names.

#### Scenario: Spelling check

- **WHEN** the docs, README and CLI strings are checked
- **THEN** any "RELKIT" or "Relkit" outside code fails the check with its location

### Requirement: Actionable messages

Every user-facing error or warning SHALL state what happened and what to do next, and SHALL include a
stable `RELKIT_*` code and a link to that code's docs page.

#### Scenario: Untested runtime warning

- **WHEN** `create-relkit` runs on an untested Bun version
- **THEN** it prints a warning with a code, the next step and a docs link, and continues

### Requirement: Error codes have docs pages

Every `RELKIT_*` code the CLI or runtime can emit SHALL have a generated docs page that explains the
cause and the fix.

#### Scenario: Code without a page

- **WHEN** a new diagnostic code is added without documentation
- **THEN** docs generation fails and names the code

### Requirement: No internal process terms

User-facing text SHALL NOT use internal process terms such as tuple, certified, readiness evidence,
receipt, capsule, cohort or admission, and SHALL NOT include instructions meant for coding agents.

#### Scenario: Banned term in the README

- **WHEN** the README contains "reference-host readiness evidence"
- **THEN** the language check fails and names the term and its location

### Requirement: Changelog format

The changelog SHALL list one line per change, grouped under Breaking, New and Fixed, and every
breaking change SHALL link to its migration note.

#### Scenario: Breaking change entry

- **WHEN** a release includes a breaking change
- **THEN** its changelog line sits under Breaking and links to the migration guide section

#### Scenario: Release tag

- **WHEN** a release is published
- **THEN** its changelog heading and Git tag show the single release version

### Requirement: Accurate facts

User-facing text SHALL describe the release it ships with: tool names, template lists and supported
targets SHALL match that release.

#### Scenario: Template list changes

- **WHEN** a template is added or removed
- **THEN** the README, the templates README and the creation help list the same templates

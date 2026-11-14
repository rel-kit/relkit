## ADDED Requirements

### Requirement: Generated database code runs on every Tier 1 runtime

`relkit add database` SHALL generate a database service and scripts that run on Bun and on Node for every supported dialect, and SHALL add the driver dependency the selected runtime needs.

#### Scenario: PostgreSQL in an npm project

- **WHEN** a project created with npm adds a PostgreSQL database
- **THEN** `npm run check`, `npm run dev` and `npm run db:migrate` succeed on Node without Bun installed

### Requirement: Manifest fields match the package manager

Creation SHALL write only the patch and install-script fields that the selected package manager honours, and SHALL tell the user when a declaration-only repair is skipped.

#### Scenario: Creation with npm

- **WHEN** a project is created with npm
- **THEN** its manifest contains no field that npm ignores silently

### Requirement: Commands explain missing prerequisites

A command whose prerequisite is missing SHALL fail with a `RELKIT_*` code and the command that produces the prerequisite. A failed configuration load SHALL show the configuration's own message. An unknown command SHALL be reported as unknown, with the available commands.

#### Scenario: Start without a build

- **WHEN** `relkit start` runs and no build exists
- **THEN** the diagnostic names `relkit build`

#### Scenario: Migration configuration throws

- **WHEN** the Drizzle configuration throws because a variable is unset
- **THEN** the diagnostic includes that message

#### Scenario: Nothing to migrate

- **WHEN** `relkit db migrate` runs with no pending migration
- **THEN** the output says the database is up to date

### Requirement: Check reports the root cause alone

When evaluation fails, `relkit check` SHALL report the evaluation diagnostics without type errors that only follow from the missing generated registries, and `relkit graph` SHALL say that the last check failed.

#### Scenario: One failing import

- **WHEN** a service file fails to load
- **THEN** `relkit check` prints one error, and `relkit graph` refers to that failed check

### Requirement: Provider diagnostics point at the binding

A diagnostic about a provider binding SHALL point at the binding's entry in the configuration and SHALL name a valid replacement.

#### Scenario: Local-only bucket at build time

- **WHEN** `relkit build` rejects a local-only bucket binding
- **THEN** the location is the bucket entry and the message names a connected or infrastructure source

### Requirement: Doctor reports runtime blockers

`relkit doctor` SHALL report application imports that the current runtime cannot load, environment files the current runtime will not read, and manifest fields the package manager ignores.

#### Scenario: Node with a Bun-only service

- **WHEN** `relkit doctor` runs on Node in a project whose database service imports a Bun-only driver
- **THEN** it reports that import as a blocker

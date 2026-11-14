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

## MODIFIED Requirements

### Requirement: Database and authentication scaffolds are complete

Database scaffolding SHALL generate one singleton Drizzle service for SQLite, PostgreSQL, or MySQL, a non-empty dialect-specific schema, configuration, environment references, ignore rules, dependencies, and generate/migrate scripts without running migrations. Authentication scaffolding SHALL use Better Auth, reuse or chain database creation, generate its required schema instead of the generic schema when chained, enable email/password authentication, declare blank secret examples, and mount the default `/api/auth` catch-all route without generating secrets.

#### Scenario: SQLite database is added with defaults

- **WHEN** `add database` is resolved headlessly without a dialect
- **THEN** it uses Drizzle with SQLite through `openSqliteDatabase` from `@relkit/drizzle/sqlite`, which selects `bun:sqlite` on Bun and `node:sqlite` on Node, creates an `items` schema, and reports migration commands as next steps

#### Scenario: Auth is added without a database

- **WHEN** Better Auth is added to a project without a database service
- **THEN** the same transaction creates the selected Drizzle database with Better Auth tables and omits the generic `items` table

### Requirement: Migration execution is owned by RELKIT tooling

Generated applications SHALL expose db:generate and db:migrate commands with explicit application configuration. The installed relkit db migrate command SHALL accept --config, defaulting to drizzle.config.ts at the application root. Reusable runner implementation SHALL reside in RELKIT tooling rather than copied application scripts. SQLite SHALL use the native driver of the runtime the tooling runs on, `bun:sqlite` on Bun and `node:sqlite` on Node; PostgreSQL and MySQL SHALL remain supported.

#### Scenario: Explicit migration configuration is selected

- **WHEN** a developer invokes relkit db migrate with --config or requests its help
- **THEN** execution honors the selected application configuration and help documents the option, default, and existing CLI output/exit conventions
- **AND** the command does not start the application or inspector or change the separate layout-migration command

#### Scenario: Config and environment suggest different targets

- **WHEN** the selected configuration resolves a database target or history directory different from a raw environment value or the former ./drizzle default
- **THEN** execution uses the configuration's dialect, connection, output directory and supported migration-log settings without a second environment-based target or fallback history

#### Scenario: Configuration is in a nested directory

- **WHEN** --config selects a relative nested path or an absolute configuration path
- **THEN** relative output and database paths remain based on the application-root working directory, and generate/migrate retain the same effective environment without loading .env.example

#### Scenario: SQLite migration is run from a generated project

- **WHEN** a developer runs db:migrate with valid persistent SQLite configuration
- **THEN** the installed tooling applies pending migrations using the SQLite driver built into the runtime it runs on, closes its connection, and exits without requiring a copied runner or an installed SQLite driver package

#### Scenario: Configuration cannot identify a persistent target

- **WHEN** required connection configuration is missing or SQLite is configured with an empty or in-memory target
- **THEN** migration exits nonzero with an actionable diagnostic without silently selecting another database or exposing secrets

#### Scenario: Migration history is missing or incompatible

- **WHEN** the configured history cannot be read by the selected migrator
- **THEN** execution fails before opening the target database, reports the appropriate generation or compatibility action, and does not initialize an empty history, reset the log, or silently select another directory

#### Scenario: PostgreSQL or MySQL migration is run

- **WHEN** a developer runs the generated migration commands against a supported PostgreSQL or MySQL database
- **THEN** the installed tooling uses the configured target and service-owned history and reports errors with a nonzero exit status

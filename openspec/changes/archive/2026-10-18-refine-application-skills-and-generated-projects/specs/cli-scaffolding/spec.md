# Spec Delta

## ADDED Requirements

### Requirement: Generated backend applications omit unsolicited frontend scaffolding

Default backend templates and database/auth additions SHALL NOT introduce frontend pages, demo interfaces, app.js, assets.css, or other frontend scaffolding. Explicitly selected fullstack functionality and existing frontend work SHALL remain intact.

#### Scenario: Backend database or auth is added

- **WHEN** a generated backend application adds database or authentication support
- **THEN** the output contains the required backend service, schema, configuration, and route artifacts without unsolicited frontend files

#### Scenario: Fullstack functionality is selected

- **WHEN** an explicitly selected fullstack candidate is exercised
- **THEN** its frontend/backend wrapper remains functional and backend defaults do not remove requested frontend functionality

### Requirement: Generated ignore rules cover framework output and retain migration source

Every applicable template SHALL ignore the complete .relkit directory within its application root while preserving other ignore rules. Database scaffolding SHALL keep SQL migration files and required metadata outside ignored framework output and SHALL NOT add rules that ignore its migration history.

#### Scenario: Framework adds another output directory

- **WHEN** a generated application contains a previously unknown subdirectory beneath .relkit
- **THEN** Git ignores its contents without another template change

#### Scenario: Migration files are generated

- **WHEN** the generated database command produces SQL and required metadata under the database service
- **THEN** Git can track those files while framework output, local database files, and secrets remain ignored

### Requirement: Current Drizzle compatibility repair remains unchanged

This change SHALL retain the existing Drizzle patch bytes, dependency pins, catalog registrations and portable transactional distribution. Standalone acceptance SHALL obtain the explicit repair only from candidate package assets, without inherited workspace dependencies, additional hidden repairs, weakened strict typechecking or new suppressions. The main spec's portable transactional repair requirement remains applicable.

#### Scenario: Standalone packed consumer is installed

- **WHEN** a fresh project outside the monorepo installs packed candidate packages with independent dependencies
- **THEN** installation, frozen reinstall, check, typecheck, tests, build and database/auth flows succeed using the explicit candidate-packaged repair without access to repository patches or prepatched workspace dependencies

#### Scenario: Earlier unpatched candidates fail

- **WHEN** historical unpatched-version probes fail declaration or history checks
- **THEN** their failures remain recorded and the current required repair is preserved
- **AND** this change does not claim upstream compatibility or require removal of that repair

#### Scenario: Dependency installation fails during add

- **WHEN** a database/auth addition changes dependencies and installation or validation fails
- **THEN** existing transactional scaffold behavior restores touched files and lockfile bytes while preserving unrelated changes

#### Scenario: Release metadata is regenerated

- **WHEN** release synchronization and packaging tools run
- **THEN** they preserve the exact required repair, registration and metadata, repeated synchronization is idempotent, and unrelated dependency/patch metadata remains intact

#### Scenario: Candidate dependencies read current migration history

- **WHEN** a database and migration history created by the current ORM/Kit versions are exercised with the candidate CLI and the retained repaired dependency combination
- **THEN** the unchanged history and applied log remain usable, rerunning applies nothing twice, and a subsequent generated migration works on both that database and a fresh database
- **AND** success does not depend on rewriting existing metadata, upgrading its format, rebaselining identifiers, resetting data, or suppressing strict declaration errors

### Requirement: Database migration history belongs to the database service

New grouped database scaffolds SHALL configure migration output beneath src/services/database/migrations, alongside the owning service and schema. SQL and required metadata SHALL form one ordered, Git-trackable history for the shared database; business services SHALL NOT receive independent histories as part of this change.

#### Scenario: A new database scaffold is generated

- **WHEN** SQLite, PostgreSQL, or MySQL database scaffolding is selected
- **THEN** its migration configuration targets the owning database service's migrations directory and its next steps distinguish generation from explicit execution
- **AND** scaffolding itself does not run migrations

#### Scenario: Authentication shares the database

- **WHEN** auth scaffolding creates or reuses the database service
- **THEN** authentication and business tables use the same ordered migration history and the intentional auth protocol handler remains unchanged

#### Scenario: Auth is added to an existing database service

- **WHEN** auth is added after a database-only scaffold has an existing schema and applied migration
- **THEN** existing schema exports and migration history remain intact, auth tables are added through a subsequent migration in the same history, and unrelated existing data remains accessible

### Requirement: Migration execution is owned by RELKIT tooling

Generated applications SHALL expose db:generate and db:migrate commands with explicit application configuration. The installed relkit db migrate command SHALL accept --config, defaulting to drizzle.config.ts at the application root. Reusable runner implementation SHALL reside in RELKIT tooling rather than copied application scripts. SQLite SHALL use the Bun-native driver; PostgreSQL and MySQL SHALL remain supported.

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
- **THEN** the installed tooling applies pending migrations using the Bun-native SQLite driver, closes its connection, and exits without requiring a copied runner or a Node-only SQLite driver

#### Scenario: Configuration cannot identify a persistent target

- **WHEN** required connection configuration is missing or SQLite is configured with an empty or in-memory target
- **THEN** migration exits nonzero with an actionable diagnostic without silently selecting another database or exposing secrets

#### Scenario: Migration history is missing or incompatible

- **WHEN** the configured history cannot be read by the selected migrator
- **THEN** execution fails before opening the target database, reports the appropriate generation or compatibility action, and does not initialize an empty history, reset the log, or silently select another directory

#### Scenario: PostgreSQL or MySQL migration is run

- **WHEN** a developer runs the generated migration commands against a supported PostgreSQL or MySQL database
- **THEN** the installed tooling uses the configured target and service-owned history and reports errors with a nonzero exit status

### Requirement: Migration dependencies are loaded only for migration execution

Migration tooling SHALL resolve optional database dependencies from the application and load them only for selected migration execution. CLI help and unrelated no-database workflows SHALL work without ORM/Kit installed. Missing dependencies SHALL produce an actionable failure without implicit downloads, workspace fallback, or eager database initialization.

#### Scenario: No-database application uses the CLI

- **WHEN** a clean no-database application requests help or runs supported create/check/dev commands without migration dependencies
- **THEN** those commands succeed without installing ORM/Kit or evaluating database configuration

#### Scenario: Packed migration tooling is unavailable

- **WHEN** a packed consumer invokes db migrate without a required dependency or packaged worker
- **THEN** it fails clearly without importing repository source, relying on a hoisted dependency, or fetching a package automatically

### Requirement: Migration results follow invocation ownership and output conventions

Migration execution SHALL emit one secret-safe result in JSON mode and join owned connection/process cleanup before success. Usage/configuration failures SHALL exit 2, operational failures 1, and interruption 130. Failed SQL SHALL NOT be automatically retried or reported as rolled back unless the selected driver proves rollback.

#### Scenario: Tooling writes diagnostic output during a JSON invocation

- **WHEN** config evaluation or delegated tooling writes output while db migrate --json runs
- **THEN** stdout contains exactly one structured success/failure object, diagnostics do not expose connection values, and success identifies command, dialect, config path and migration path without invented applied-migration counts

#### Scenario: Execution fails or is interrupted

- **WHEN** SQL execution fails or the invocation is cancelled
- **THEN** owned connections and child processes are cleaned up, the command reports the corresponding failure exit, and it does not claim successful application or automatic reversal of already-applied SQL

#### Scenario: Help is requested

- **WHEN** migration help is requested without valid database configuration
- **THEN** help renders without loading the config, opening a connection, or launching a migration worker

### Requirement: Migration history remains stable across sample layout changes

Repository sample updates SHALL preserve migration contents, identifiers, ordering, required metadata, stored data, and the database's applied-migration log. Moving source history SHALL NOT reset migration state or reapply completed migrations. No legacy-app upgrade command or compatibility layer SHALL be required for this change.

#### Scenario: Sample with applied migrations adopts the new directory

- **WHEN** an existing sample's migration files and configuration are moved to the new service-owned directory
- **THEN** file contents, identifiers, ordering, metadata, and the database's applied log remain unchanged and a migration run applies nothing twice

#### Scenario: Fresh and previously migrated databases advance

- **WHEN** a new migration is generated after an initial history has been applied
- **THEN** a fresh database applies the full history in order, the previously migrated database applies only the new migration, and repeated runs leave both schemas and data unchanged

### Requirement: Changed templates require fresh independent acceptance evidence

Template and packaged guidance changes SHALL retain existing creation certification gates and regenerate affected identities and evidence from the candidate bytes. Tests SHALL distinguish local source checks, packed consumer behavior, functional readiness, and separately measured performance; this change SHALL NOT broaden supported creation tuples.

#### Scenario: A template skill or migration command changes

- **WHEN** changed template or package bytes invalidate existing evidence
- **THEN** acceptance uses freshly generated identities and the current required packed checks without relabeling historical results or modifying readiness/performance thresholds

#### Scenario: A dialect or packed scenario cannot be verified

- **WHEN** a required local dependency, service, or resource budget prevents verification
- **THEN** the implementation report identifies the exact skipped or blocked scenario and does not claim complete affected-behavior acceptance

## ADDED Requirements

### Requirement: Interactive and headless command resolution

The CLI SHALL prompt for omitted required choices only when stdin and stderr are interactive terminals and neither CI nor JSON mode is active. Headless resolution SHALL use explicit flags, a unique or configured project default, the documented scaffold default, then a usage error when ambiguity remains. Running `relkit` without a command SHALL open a context-aware action menu interactively and print help otherwise.

#### Scenario: Root command runs in a terminal

- **WHEN** a user runs `relkit` in an interactive terminal
- **THEN** the CLI presents actions derived from the current project context

#### Scenario: Root command is redirected

- **WHEN** `relkit` has no command and output is redirected, CI is active, or JSON mode is requested
- **THEN** the CLI does not prompt and emits normal help using existing exit semantics

### Requirement: Shared project creation workflow

`create-relkit` and `relkit create` SHALL resolve the same name, destination, template, cloud, deployment, examples, install, and Git choices and SHALL invoke the same staged generator. Interactive creation SHALL permit repeated artifact additions against the staged project before it becomes visible at the destination.

#### Scenario: Equivalent create entrypoints are used

- **WHEN** both entrypoints receive equivalent choices
- **THEN** their normalized generated projects are byte-identical

#### Scenario: Headless customization is needed

- **WHEN** automation creates a project non-interactively
- **THEN** it can perform customization through subsequent `relkit add` commands without an encoded recipe format

### Requirement: Complete add command surface

The CLI SHALL expose add commands for service, function, error, event, event-function, job, cache, bucket, tool, prompt, agent, constants, route, middleware, transform, database, and auth. Each command SHALL accept its documented headless flags, prompt for unresolved choices interactively, normalize friendly names with a preview, and generate compile-ready source following current authoring conventions.

#### Scenario: Friendly artifact name is entered

- **WHEN** a user enters `Send Receipt` for a function
- **THEN** the preview and plan identify `send-receipt.function.ts`, `sendReceipt`, and its domain-qualified stable identity before any write

#### Scenario: Internal service member is requested

- **WHEN** `add function` or `add event` receives `--internal`
- **THEN** the descriptor is created in the selected domain but omitted from `defineService`

#### Scenario: Route path is added

- **WHEN** `add route /users/:id/details` succeeds
- **THEN** it creates `src/routes/users/[id]/details/route.ts`, and required and optional catch-all parameters use `[...name]` and `[[...name]]`

### Requirement: Service bundles are deterministic and coherent

`add service` without a mode SHALL create a service and one public example function. Repeated `--include` values SHALL select a custom bundle. `--full` SHALL atomically create the documented domain artifacts and route, wire their service, error, event, consumer, job, tool, prompt, agent, and route relationships, and add usable fallback profiles without prompting for integrations.

#### Scenario: Full service has no configured profiles

- **WHEN** a full bundle is added to a project without compatible profiles
- **THEN** it adds file-backed event and job profiles, Docker Redis and MinIO profiles, and an OpenAI AI SDK profile using `gpt-5-mini`, then warns about Docker and `OPENAI_API_KEY`

#### Scenario: Full service is planned

- **WHEN** the target project already contains any colliding file, identifier, export, service member, route method, profile, environment name, script, or package declaration
- **THEN** the entire request fails before mutation and no bundle subset is written

### Requirement: Scaffold mutations are transactional

Every add request SHALL display its files, edits, packages, profiles, warnings, and next steps before mutation; explicit commands SHALL proceed without an extra confirmation. The operation SHALL preserve unrelated dirty files, install changed dependencies once, validate with a development check, and restore new and previously existing touched files, file modes, and lockfile bytes when installation or validation fails.

#### Scenario: User cancels a prompted plan

- **WHEN** the user cancels before application
- **THEN** the target project remains byte-for-byte unchanged and the CLI reports cancellation

#### Scenario: Validation fails after writes

- **WHEN** the post-write project check fails
- **THEN** the operation restores its complete snapshot while leaving unrelated working-tree changes untouched

#### Scenario: Installation is disabled

- **WHEN** `--no-install` is used and a newly required package is unavailable
- **THEN** validation is skipped only for that reason and the result reports exact install and check commands

### Requirement: Add results and failures are stable

An add operation SHALL return created files, updated files, installed packages, structured warnings, verification status, and exact next steps. JSON mode SHALL emit exactly one result or failure object on stdout with prompts, color, progress, notes, and spinners disabled. Usage and ambiguity failures SHALL exit 2, operational failures SHALL exit 1, and interrupt cancellation SHALL exit 130 with stable failure codes for usage, invalid project, collision, unsupported source shape, installation, validation, and cancellation.

#### Scenario: JSON add succeeds

- **WHEN** an add command is run with `--json`
- **THEN** stdout contains one parseable result object and all human progress is suppressed or sent outside stdout

#### Scenario: Canonical source cannot be edited safely

- **WHEN** a required service, application, or environment object uses an ambiguous dynamic, spread, or computed shape
- **THEN** the operation reports `unsupported-source-shape` and performs no writes

### Requirement: Database and authentication scaffolds are complete

Database scaffolding SHALL generate one singleton Drizzle service for SQLite, PostgreSQL, or MySQL, a non-empty dialect-specific schema, configuration, environment references, ignore rules, dependencies, and generate/migrate scripts without running migrations. Authentication scaffolding SHALL use Better Auth, reuse or chain database creation, generate its required schema instead of the generic schema when chained, enable email/password authentication, declare blank secret examples, and mount the default `/api/auth` catch-all route without generating secrets.

#### Scenario: SQLite database is added with defaults

- **WHEN** `add database` is resolved headlessly without a dialect
- **THEN** it uses Drizzle with SQLite and `bun:sqlite`, creates an `items` schema, and reports migration commands as next steps

#### Scenario: Auth is added without a database

- **WHEN** Better Auth is added to a project without a database service
- **THEN** the same transaction creates the selected Drizzle database with Better Auth tables and omits the generic `items` table

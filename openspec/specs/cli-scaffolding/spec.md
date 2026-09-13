## Purpose

Defines deterministic RelKit command behavior and atomic project generation so a new developer can create, validate, run, inspect, build, and prepare deployment without manual wiring.

## Requirements

### Requirement: Stable RelKit CLI contract

The `relkit` CLI SHALL provide command-local and nested help, examples, generated shell completions, deterministic exit codes, human and `--json` output, and commands for development, checking, building, starting, graph print/check/diff, environment operations, doctor, project creation, and deployment delegation.

#### Scenario: Nested help is requested

- **WHEN** a user runs `relkit create --help` or help for a deeper command such as `relkit graph diff`
- **THEN** output contains that command's usage, flags, examples, and subcommands without unrelated root-only help

#### Scenario: Check fails semantically

- **WHEN** `relkit check` encounters compiler errors
- **THEN** it emits structured diagnostics, exits non-zero, and does not leave an activatable generated manifest

#### Scenario: JSON mode is requested

- **WHEN** a supported command runs with `--json`
- **THEN** stdout contains stable machine-readable output and progress/logging does not corrupt it

#### Scenario: Non-interactive output is used

- **WHEN** output is redirected, CI is active, or JSON mode is requested
- **THEN** animated/color-rich progress is disabled while diagnostics and exit semantics remain unchanged

### Requirement: Environment commands are secret-safe

`relkit env check`, `example`, `explain`, and `list` SHALL validate the active contract, generate deterministic examples, explain metadata, and report names/status without revealing secrets or overwriting edited files unless explicitly requested.

#### Scenario: Example file exists

- **WHEN** `relkit env example` is run without `--write` against an edited `.env.example`
- **THEN** it reports deterministic proposed content without overwriting the file

#### Scenario: Secret is explained

- **WHEN** `relkit env explain OPENAI_API_KEY` runs
- **THEN** it prints type, requirements, default presence, sensitivity, and description but not a resolved value

### Requirement: Supported non-interactive options

The generator SHALL support template `minimal|api|agent`, cloud `aws|none`, deploy `pulumi|none`, install, Git, examples, directory, explicit empty-directory override, and JSON flags, and SHALL expose no persistence or identity flags.

#### Scenario: Agent template without install is selected

- **WHEN** a caller uses `--template agent --no-install --json`
- **THEN** the selected deterministic files are generated, dependency installation is skipped, and a machine-readable result reports exact next steps

### Requirement: Atomic destination creation

The generator SHALL validate package name/path, refuse a non-empty destination unless explicitly permitted, stage generation in a temporary sibling, perform requested install/Git plus project doctor/check before final rename, and leave the destination unchanged on any pre-rename failure.

#### Scenario: Project check fails during generation

- **WHEN** a staged template cannot pass its required validation
- **THEN** generation exits non-zero, removes or reports the temporary directory safely, and leaves no partial destination

#### Scenario: Non-empty destination is supplied

- **WHEN** the destination contains files and no explicit empty-directory override is valid
- **THEN** the generator refuses before modifying either existing files or package state

### Requirement: First-run workflow works as printed

After successful default generation, the printed `cd` and `bun run dev` commands SHALL start a backend, inspector, OpenAPI endpoint, and API reference, expose the example `GET /hello` route, and allow documented test/check/build commands to succeed.

#### Scenario: New developer follows output

- **WHEN** the printed next commands are executed on a supported clean environment
- **THEN** the route returns the expected greeting, appears in the inspector graph and API reference, and the generated test/check/build scripts pass

### Requirement: Doctor reports prerequisites safely

`relkit doctor` SHALL check supported Bun/TypeScript/package versions, Pulumi availability when enabled, AWS credential visibility without printing credentials, writable state directories, ports, config/app validity, and frozen-lock consistency.

#### Scenario: AWS credentials are missing

- **WHEN** deployment is enabled but credentials are not visible
- **THEN** doctor reports the missing prerequisite without printing any credential-like environment value

### Requirement: Packed-artifact generator acceptance

Generator acceptance SHALL execute the packed package rather than workspace-linked source and SHALL prove generated projects install frozen, check, typecheck, test, build, start, serve the example route, expose the graph API, shut down, and contain deterministic files.

#### Scenario: Release candidate generator is packed

- **WHEN** the smoke suite invokes its tarball from a temporary parent directory
- **THEN** all selected option combinations pass the documented project commands without workspace resolution

### Requirement: Fixed project conventions and port precedence

CLI operations SHALL use fixed application/source/generated conventions and SHALL resolve application and inspector ports by documented flag, environment, configuration, and default precedence.

#### Scenario: Every application port source is present

- **WHEN** `--port`, `PORT`, `server.port`, and the default are available
- **THEN** the CLI uses `--port`

#### Scenario: Inspector environment override is present

- **WHEN** no inspector flag is passed and `RELKIT_INSPECTOR_PORT` is set
- **THEN** it overrides `inspector.port` and the default

### Requirement: Self-contained packaged development

The packed CLI SHALL include or resolve a compatible prebuilt inspector without requiring a repository checkout, while allowing an explicit contributor-only inspector-root override.

#### Scenario: Packed development starts outside the monorepo

- **WHEN** a generated project installs the packed CLI in a temporary directory and runs development
- **THEN** the backend, inspector, OpenAPI, and API reference start and shut down without `RELKIT_INSPECTOR_ROOT`

#### Scenario: Port is occupied

- **WHEN** a requested backend or inspector port cannot be bound
- **THEN** startup identifies the port and its applicable override without leaving child processes running

### Requirement: Generated templates teach service composition

Every generated template SHALL use domain-first source layout and public service APIs. The API and agent templates SHALL demonstrate public service functions, direct invocation, and applicable events/tools; the minimal template SHALL contain one small `hello` domain without speculative integrations.

#### Scenario: API template is generated

- **WHEN** a developer creates the API template
- **THEN** its route maps to a public service function, nested calls use service members, and all source descriptors live beneath owned domains or the routes/platform layers

#### Scenario: Minimal template is generated

- **WHEN** a developer creates the minimal template
- **THEN** it contains one service and one function under `src/hello` and does not scaffold empty categories, agents, events, database, or auth

### Requirement: Agent template derives a tool from a function

The agent template SHALL expose one useful function through `asTool`, configure both `defaultProvider` and `defaultModel` with named model providers, use deterministic AI SDK test models outside production, and avoid a duplicate tool handler or wrapper module.

#### Scenario: Agent project is generated

- **WHEN** the generated agent handles a request that needs its tool
- **THEN** the AI SDK tool loop invokes the original function once through the common engine and the generated tests assert its validated result and trace

### Requirement: API template explains independent event fan-out

The API template SHALL include one contract-only domain event, one normal function that declares it in `publishes`, and at least two independently testable `defineEventFunction` reactions with distinct responsibilities; its documentation SHALL state at-least-once and independent-failure semantics without selectors, callback listeners, or compatibility APIs.

#### Scenario: Template event is published

- **WHEN** the example publishes its domain event
- **THEN** both event functions become eligible, one function's failure cannot roll back the other's success, and deterministic tests can deliver and inspect each independently

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

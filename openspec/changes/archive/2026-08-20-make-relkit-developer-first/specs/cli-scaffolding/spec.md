## ADDED Requirements

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

## MODIFIED Requirements

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

### Requirement: Project creation entry points and defaults

`bunx create-relkit@latest <name>` and `relkit create <name>` SHALL generate a convention-based TypeScript/Bun project using internal Hono, `@relkit/schema`, built-in local/test providers, Pulumi/AWS defaults, a minimal function and named-method `src/routes/**/route.ts`, typed config, tests, Bun package management, and Git initialization when available unless flags override supported choices.

#### Scenario: Default project is generated

- **WHEN** a valid name and empty destination are supplied with default options
- **THEN** the generated tree, scripts, exact compatible package versions, configuration, app/env descriptors, route files, examples, tests, README, ignore rules, and lockfile match the documented baseline

#### Scenario: Both creation entry points receive equivalent options

- **WHEN** the packed `create-relkit` binary and `relkit create` run with the same normalized options in separate empty destinations
- **THEN** `relkit create` delegates to the same generator API and both destinations are byte-identical apart from explicitly documented destination-derived values

### Requirement: First-run workflow works as printed

After successful default generation, the printed `cd` and `bun run dev` commands SHALL start a backend, inspector, OpenAPI endpoint, and API reference, expose the example `GET /hello` route, and allow documented test/check/build commands to succeed.

#### Scenario: New developer follows output

- **WHEN** the printed next commands are executed on a supported clean environment
- **THEN** the route returns the expected greeting, appears in the inspector graph and API reference, and the generated test/check/build scripts pass

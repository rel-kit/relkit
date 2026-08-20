## Purpose

Defines deterministic ZSys command behavior and atomic project generation so a new developer can create, validate, run, inspect, build, and prepare deployment without manual wiring.

## Requirements

### Requirement: Stable ZSys CLI contract

The `zsys` CLI SHALL provide command-local and nested help, examples, generated shell completions, deterministic exit codes, human and `--json` output, and commands for development, checking, building, starting, graph print/check/diff, environment operations, doctor, project creation, and deployment delegation.

#### Scenario: Nested help is requested

- **WHEN** a user runs `zsys create --help` or help for a deeper command such as `zsys graph diff`
- **THEN** output contains that command's usage, flags, examples, and subcommands without unrelated root-only help

#### Scenario: Check fails semantically

- **WHEN** `zsys check` encounters compiler errors
- **THEN** it emits structured diagnostics, exits non-zero, and does not leave an activatable generated manifest

#### Scenario: JSON mode is requested

- **WHEN** a supported command runs with `--json`
- **THEN** stdout contains stable machine-readable output and progress/logging does not corrupt it

#### Scenario: Non-interactive output is used

- **WHEN** output is redirected, CI is active, or JSON mode is requested
- **THEN** animated/color-rich progress is disabled while diagnostics and exit semantics remain unchanged

### Requirement: Environment commands are secret-safe

`zsys env check`, `example`, `explain`, and `list` SHALL validate the active contract, generate deterministic examples, explain metadata, and report names/status without revealing secrets or overwriting edited files unless explicitly requested.

#### Scenario: Example file exists

- **WHEN** `zsys env example` is run without `--write` against an edited `.env.example`
- **THEN** it reports deterministic proposed content without overwriting the file

#### Scenario: Secret is explained

- **WHEN** `zsys env explain OPENAI_API_KEY` runs
- **THEN** it prints type, requirements, default presence, sensitivity, and description but not a resolved value

### Requirement: Project creation entry points and defaults

`bunx create-zsys@latest <name>` and `zsys create <name>` SHALL generate a convention-based TypeScript/Bun project using internal Hono, `@zsys/schema`, built-in local/test providers, Pulumi/AWS defaults, a minimal function and named-method `src/routes/**/route.ts`, typed config, tests, Bun package management, and Git initialization when available unless flags override supported choices.

#### Scenario: Default project is generated

- **WHEN** a valid name and empty destination are supplied with default options
- **THEN** the generated tree, scripts, exact compatible package versions, configuration, app/env descriptors, route files, examples, tests, README, ignore rules, and lockfile match the documented baseline

#### Scenario: Both creation entry points receive equivalent options

- **WHEN** the packed `create-zsys` binary and `zsys create` run with the same normalized options in separate empty destinations
- **THEN** `zsys create` delegates to the same generator API and both destinations are byte-identical apart from explicitly documented destination-derived values

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

### Requirement: Generated application stays on public APIs

Generated source SHALL use ordinary async handlers, Standard Schema via `@zsys/schema`, public `@zsys/*` descriptors/testing helpers, global providers, body capture off by default, and SHALL contain no internal Effect, Hono, Next.js, Pulumi, or cloud SDK import.

#### Scenario: Generated source is scanned

- **WHEN** each supported template is generated
- **THEN** the forbidden-import scan passes and functions remain the only authored handlers

### Requirement: First-run workflow works as printed

After successful default generation, the printed `cd` and `bun run dev` commands SHALL start a backend, inspector, OpenAPI endpoint, and API reference, expose the example `GET /hello` route, and allow documented test/check/build commands to succeed.

#### Scenario: New developer follows output

- **WHEN** the printed next commands are executed on a supported clean environment
- **THEN** the route returns the expected greeting, appears in the inspector graph and API reference, and the generated test/check/build scripts pass

### Requirement: Doctor reports prerequisites safely

`zsys doctor` SHALL check supported Bun/TypeScript/package versions, Pulumi availability when enabled, AWS credential visibility without printing credentials, writable state directories, ports, config/app validity, and frozen-lock consistency.

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

- **WHEN** no inspector flag is passed and `ZSYS_INSPECTOR_PORT` is set
- **THEN** it overrides `inspector.port` and the default

### Requirement: Self-contained packaged development

The packed CLI SHALL include or resolve a compatible prebuilt inspector without requiring a repository checkout, while allowing an explicit contributor-only inspector-root override.

#### Scenario: Packed development starts outside the monorepo

- **WHEN** a generated project installs the packed CLI in a temporary directory and runs development
- **THEN** the backend, inspector, OpenAPI, and API reference start and shut down without `ZSYS_INSPECTOR_ROOT`

#### Scenario: Port is occupied

- **WHEN** a requested backend or inspector port cannot be bound
- **THEN** startup identifies the port and its applicable override without leaving child processes running

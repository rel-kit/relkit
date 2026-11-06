# Spec Delta

## MODIFIED Requirements

### Requirement: Supported non-interactive options

The generator SHALL resolve template `minimal|api|agent|fullstack|tasks`, cloud `aws|none`, deploy
`pulumi|none`, jobs, install, Git, examples, directory, empty-directory override, `--strict` and JSON
flags, and SHALL expose no persistence or identity flags. Every valid combination SHALL be offered. A
combination without current CI readiness evidence for the running tool and runtime SHALL produce a
coded warning and continue, or, with `--strict`, SHALL be rejected before any file is written.

#### Scenario: Agent template without install is selected

- **WHEN** a caller uses `--template agent --no-install --json`
- **THEN** deterministic files are generated, installation is skipped, and the machine-readable
  result reports installation, checking and development next steps

#### Scenario: A combination misses the readiness gate

- **WHEN** a valid combination has failed, missing or stale CI readiness evidence for the running
  Bun or Node version
- **THEN** creation continues and prints a coded warning that names the combination and links to its
  docs page

#### Scenario: Strict mode refuses an untested combination

- **WHEN** `--strict` is set and the requested combination is untested
- **THEN** creation stops before writing any file, with a coded error that lists the tested
  combinations

#### Scenario: Interactive partial choices would permit a rejected tuple

- **WHEN** the developer has made some runtime-affecting choices interactively
- **THEN** later choices still offer every valid combination and mark untested ones, and only
  `--strict` limits them to tested combinations

#### Scenario: Default combination fails in CI

- **WHEN** the default minimal combination fails release readiness on any Tier 1 runtime
- **THEN** the release is blocked

### Requirement: Post-install development preparation

`relkit dev --prepare` SHALL check the project without opening a development listener or the
Inspector and SHALL NOT publish a snapshot. `--no-install` next steps SHALL list the install, check
and dev commands for the project's package manager in order, with local executable resolution and no
implicit package download.

#### Scenario: Installation was skipped

- **WHEN** the developer follows the printed post-install workflow in a generated project
- **THEN** each command succeeds, no server runs until `dev`, and the first `dev` start meets the
  development startup budget

#### Scenario: Source becomes invalid before preparation

- **WHEN** a project's source is invalid when `relkit dev --prepare` runs
- **THEN** preparation reports the errors with source locations and exits non-zero without starting a
  server

### Requirement: Changed templates require fresh independent acceptance evidence

Template and packaged guidance changes SHALL regenerate affected readiness evidence in CI from the
candidate bytes. Tests SHALL distinguish local source checks, packed consumer behavior, functional
readiness and separately measured performance. Evidence SHALL decide which combinations creation
reports as tested, not which combinations it offers.

#### Scenario: A template skill or migration command changes

- **WHEN** changed template or package bytes invalidate existing evidence
- **THEN** CI measures the affected combinations again with fresh identities, without relabeling
  historical results or changing readiness or performance thresholds

#### Scenario: A dialect or packed scenario cannot be verified

- **WHEN** a required local dependency, service, or resource budget prevents verification
- **THEN** the implementation report identifies the exact skipped or blocked scenario and does not
  claim complete affected-behavior acceptance

## ADDED Requirements

### Requirement: Every template can be created

`create-relkit` SHALL offer the `minimal`, `api`, `agent`, `fullstack` and `tasks` templates on every
Tier 1 runtime.

#### Scenario: API template on the newest Bun

- **WHEN** a developer runs `bunx create-relkit@latest my-app --template api` on the newest Bun
  release
- **THEN** the project is created and its dev server serves the template's routes

### Requirement: Add covers backends and exporters

`relkit add` SHALL add job and event backends, including the Postgres backend, and telemetry exporters
as transactional edits, in addition to its existing kinds.

#### Scenario: Add the Postgres backend

- **WHEN** a developer runs `relkit add jobs --provider postgres`
- **THEN** the binding, dependency and environment example are added and `relkit check` passes, or
  every change is rolled back

### Requirement: Templates use the public package layout

Generated projects SHALL depend on `relkit` and only the `@relkit/*` packages they use, all on one
version, SHALL use Zod 4 for schemas, SHALL have no direct `effect` dependency, and their `start`
script SHALL run `relkit start`.

#### Scenario: Generated package manifest

- **WHEN** the `api` template is created
- **THEN** its RelKit packages share one version, `zod` is a dependency, `effect` is not a direct
  dependency, and `start` runs `relkit start`

### Requirement: Fresh clones type-check

A generated project SHALL type-check after a fresh clone and dependency install, without first running
`relkit check` or `relkit dev`.

#### Scenario: Fresh clone

- **WHEN** a developer clones a generated project and installs its dependencies
- **THEN** `tsc --noEmit` succeeds

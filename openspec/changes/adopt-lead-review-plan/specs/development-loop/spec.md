# Spec Delta

## Purpose

Defines how `relkit dev` reacts to source changes: fast incremental reloads, non-blocking type errors,
safe restarts and published performance budgets.

## ADDED Requirements

### Requirement: Incremental reload

On a save that changes no configuration, provider binding, environment contract or dependency,
`relkit dev` SHALL re-evaluate only the changed modules and their dependents in a warm process and
SHALL swap the affected handlers without restarting the server.

#### Scenario: Handler body changes

- **WHEN** a developer edits a function handler and saves
- **THEN** the next request uses the new handler and the server process is unchanged

### Requirement: Type errors do not block reloads

Type-checking SHALL run in parallel with reloads. Type errors SHALL be reported as diagnostics
without blocking a reload whose changed modules evaluate and compile into a valid graph.

#### Scenario: Type error after a save

- **WHEN** a save introduces a type error but the module still evaluates
- **THEN** the reload completes and the type error appears in the CLI and Inspector diagnostics

### Requirement: Last known good on failure

When changed modules fail to evaluate or the graph becomes invalid, the previous generation SHALL keep
serving and the failure SHALL be reported with source locations.

#### Scenario: Syntax error

- **WHEN** a save introduces a syntax error
- **THEN** requests keep using the previous handlers and the CLI shows the error's location

### Requirement: Full restart on configuration changes

Changes to `relkit.config.ts`, provider bindings, environment contracts or installed dependencies
SHALL trigger a full blue/green restart with the existing readiness checks.

#### Scenario: Provider binding changes

- **WHEN** the cache provider binding changes
- **THEN** a new server generation starts, becomes ready and replaces the old one

### Requirement: No production bundling in development

`relkit dev` SHALL NOT run the production bundler on a save.

#### Scenario: Save during development

- **WHEN** a handler is saved
- **THEN** no production bundle is written

### Requirement: Reload and memory budgets

For generated benchmark apps with 10, 100 and 500 functions, save-to-serving p95 SHALL be under 300
ms, 1 s and 2 s, and `relkit check` peak memory SHALL be at or below plain `tsc` for 10 and 100
functions and under 1.5 times `tsc` for 500.

#### Scenario: Budget is exceeded

- **WHEN** a change makes the 100-function reload p95 exceed 1 s
- **THEN** the benchmark job reports the measured value and host as a missed budget
- **AND** the published benchmarks page shows the budget as not met

#### Scenario: Budgets become blocking

- **WHEN** the CI runner meets every budget for a release
- **THEN** the benchmark job runs without `--advisory` from that release on, and a later miss
  fails release readiness

### Requirement: Published benchmarks

Reload time and check memory for the three benchmark sizes SHALL be measured for every release and
published on a public benchmarks page together with the host used.

#### Scenario: Release benchmarks

- **WHEN** a release is published
- **THEN** the benchmarks page shows that release's values and the measuring host

### Requirement: Fast first start without preparation

The first `relkit dev` start of a generated template SHALL reach its first successful response within
the release-readiness startup budget without a separate preparation step.

#### Scenario: First start after creation

- **WHEN** a developer starts the dev server right after creating a project
- **THEN** the first response arrives within the startup budget without running
  `relkit dev --prepare`

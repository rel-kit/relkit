# development-loop Specification

## Purpose
Defines how `relkit dev` reacts to source changes: fast incremental reloads, non-blocking type errors,
safe restarts and published performance budgets.

## Requirements

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

### Requirement: Compile failures are reported as compile failures

When a changed file fails to parse or load, the development server SHALL report the failure with its file and line as soon as the candidate fails, SHALL NOT wait for a health timeout, and SHALL start the next rebuild as soon as a later change arrives.

#### Scenario: Syntax error then a fix

- **WHEN** a file is saved with a syntax error and corrected two seconds later
- **THEN** the syntax error is reported within the reload budget with file and line, and the corrected version is serving within the reload budget of the second save

### Requirement: The development worker listens where the developer asked

The development worker SHALL bind to the same host as the development server's public listener.

#### Scenario: Default development start

- **WHEN** `relkit dev` runs with the default host
- **THEN** no listener of the development server is bound to a non-loopback address

### Requirement: Stopping is not an error

Stopping a command with an interrupt or termination signal SHALL exit with the conventional status and SHALL NOT print an error diagnostic in human output.

#### Scenario: Ctrl+C on the development server

- **WHEN** the developer presses Ctrl+C
- **THEN** the output ends with a neutral stop line and the exit status is 130

### Requirement: The development server judges origins against the address the client used

Behind the development proxy, the worker SHALL see the authority the client connected to on every supported runtime, for HTTP requests and for WebSocket connections, so same-origin checks compare a request's `Origin` with the public address. The worker SHALL NOT take that authority from a forwarding header a client can send.

#### Scenario: Same-origin POST on Node

- **WHEN** `relkit dev` runs on Node and a `POST` arrives whose `Origin` equals the server's public origin
- **THEN** the request is served, and a `POST` from another origin answers 403 `origin-denied`

#### Scenario: Same-origin WebSocket on Node

- **WHEN** `relkit dev` runs on Node and a WebSocket opens with an `Origin` equal to the server's public origin
- **THEN** the connection is accepted, and one from another origin is refused

#### Scenario: Forged forwarding headers

- **WHEN** a request carries `X-Forwarded-Host` or `Forwarded` naming another host
- **THEN** the origin verdict is the same as without them

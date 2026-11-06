# Spec Delta

## Purpose

Defines which JavaScript runtimes RelKit applications and tools run on, what each runtime tier
supports, and how portability is verified.

## ADDED Requirements

### Requirement: Runtime tiers

RelKit SHALL support every Core feature on Tier 1 runtimes (Bun, and Node LTS 22 and 24), HTTP with
external durable backends on the Tier 2 runtime (Cloudflare Workers), and SHALL label other runtimes
Labs until they pass the runtime tests.

#### Scenario: Tier 2 graph needs local state

- **WHEN** an application built for Workers selects a provider that needs a local filesystem or a
  long-lived process
- **THEN** `relkit check` fails with a coded diagnostic that names the provider and a supported
  alternative

### Requirement: Production server runs on Node

`relkit build` SHALL produce a production server that runs on Node LTS with the same HTTP behavior
as on Bun.

#### Scenario: Same HTTP suite on both runtimes

- **WHEN** the `api` template's production build runs on Bun and on Node LTS
- **THEN** the same HTTP test suite passes on both

### Requirement: CLI and creation run on Node

`create-relkit` and the RelKit CLI SHALL run on Node LTS without Bun installed, using the project's
package manager.

#### Scenario: Creation with npx

- **WHEN** a developer runs `npx create-relkit my-app` on a machine without Bun
- **THEN** the project is created with npm, and `npm run dev` starts the backend

### Requirement: Workers HTTP target

`relkit build` SHALL produce a Cloudflare Workers bundle for an application whose graph uses only
Workers-compatible providers.

#### Scenario: HTTP-only app on Workers

- **WHEN** an HTTP-only app is built for Workers and run in the Workers runtime
- **THEN** its HTTP test suite passes

### Requirement: Runtime-specific code behind adapters

Framework packages SHALL NOT call runtime-specific APIs outside runtime adapters. Serving, static
files, WebSocket upgrades, crypto and filesystem access SHALL go through the selected adapter.

#### Scenario: Bun-only call outside the adapter

- **WHEN** a framework package calls a `Bun.*` API outside the Bun adapter
- **THEN** the portability check fails and names the call site

### Requirement: Portable integrations

Core integrations SHALL work on every Tier 1 runtime. An integration that needs a runtime-specific
client SHALL declare its supported runtimes, and selecting it on another runtime SHALL fail at check
time with a coded diagnostic.

#### Scenario: Redis on Node

- **WHEN** an app that uses the Redis integration runs on Node
- **THEN** its cache, realtime and agent-state operations pass the same conformance tests as on Bun

### Requirement: Declared engines match support

Each package's `engines` field SHALL list every Tier 1 runtime that the package supports.

#### Scenario: Engines inspection

- **WHEN** the packed manifests are inspected
- **THEN** framework packages declare both Bun and Node engine ranges

### Requirement: Runtime CI matrix

CI SHALL run the HTTP and integration suites on every Tier 1 runtime for each pull request, and on
Tier 2 nightly once its deploy target ships.

#### Scenario: Node regression

- **WHEN** a change breaks the Node production server
- **THEN** the pull request's Node job fails before merge

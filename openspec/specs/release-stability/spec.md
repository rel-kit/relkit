# release-stability Specification

## Purpose
Defines what RelKit promises about stability: which features are Core or Labs, how versions,
deprecations and migrations work, and what 1.0 means.

## Requirements

### Requirement: Maturity tiers

Every public API, integration, runtime and deploy target SHALL be labelled Core or Labs. Core SHALL
be covered by the stability policy and tested on every Tier 1 runtime; Labs SHALL carry no
compatibility promise.

#### Scenario: Labs API is used

- **WHEN** a developer hovers a Labs API in an editor or opens its docs page
- **THEN** the TSDoc `@experimental` tag and the docs "Labs" badge both state that it can change in
  any release

### Requirement: Initial tier assignment

Core SHALL include functions, services, routes, schemas, env and config, events, jobs and schedules
with local and Postgres backends, cache, buckets, Drizzle, Better Auth, built-in telemetry, the
typed client, testing, the CLI, the Inspector, `relkit mcp`, agent declarations and tools, Bun and
Node LTS, and the Docker and Railway deploys. Every other feature SHALL start in Labs.

#### Scenario: Maturity table is published

- **WHEN** the docs site is built
- **THEN** a maturity page lists every feature with its tier, and realtime, AWS hosting, the Inngest,
  Trigger.dev and Effect MQ adapters, agent adapters and graph workflows appear as Labs

#### Scenario: A Labs target is promoted

- **WHEN** the Vercel, Cloudflare or Workers target passes its newcomer deploy test in CI
- **THEN** it moves to Core through an update to the maturity table

### Requirement: Tier consistency is checked

Each package's maturity metadata, its TSDoc tags and its docs badges SHALL agree, and a repository
check SHALL fail when they disagree.

#### Scenario: Labs API lacks its tag

- **WHEN** a Labs export has no `@experimental` tag
- **THEN** the maturity check fails and names the export

### Requirement: Feature freeze until 1.0

Until Core reaches 1.0, no new feature area — descriptor kind, provider family or integration — SHALL
be added unless an approved OpenSpec change lists it. Bug fixes and hardening SHALL remain allowed in
Core and Labs.

#### Scenario: New provider family is proposed

- **WHEN** a pull request adds a provider family that no approved change lists
- **THEN** review rejects it until an OpenSpec change approves it

### Requirement: Semantic versioning for Core

From 1.0, Core APIs SHALL follow semantic versioning: incompatible changes SHALL ship only in major
releases.

#### Scenario: Breaking change after 1.0

- **WHEN** a Core API changes incompatibly after 1.0
- **THEN** the change ships only in a new major version

### Requirement: Deprecation window

A deprecated Core API SHALL keep working, with a coded deprecation warning that names its
replacement, for at least one minor release before removal.

#### Scenario: Deprecated API is called

- **WHEN** an application uses a deprecated Core API
- **THEN** it works, and `relkit check` reports a deprecation warning with the replacement and a docs
  link

### Requirement: Migrations for breaking changes

Every breaking change SHALL ship with an automated migration run by `relkit migrate` and a migration
note in the changelog. Changes the migration cannot apply SHALL be reported with file and line.

#### Scenario: Developer upgrades

- **WHEN** a developer runs `relkit migrate` after upgrading
- **THEN** supported changes are applied, the rest are listed with file and line, and `relkit check`
  passes on the migrated repository examples

### Requirement: One pre-1.0 breaking release

The `relkit` rename and every breaking API change in this plan SHALL ship together in one release,
preceded by a beta, with one migration and one migration guide. Additive changes SHALL be free to
ship before or after it.

#### Scenario: Beta precedes the release

- **WHEN** the breaking release is prepared
- **THEN** a beta is published first, and every repository example and template is migrated by
  `relkit migrate` before the final release

### Requirement: Published 1.0 criteria

The docs SHALL publish a versioning and upgrades page with the stability policy, the 1.0 criteria and
a 1.0 target date.

#### Scenario: Developer evaluates stability

- **WHEN** a developer opens the versioning page
- **THEN** it states what semver covers, the deprecation window, how migrations work, the 1.0
  criteria and the target date

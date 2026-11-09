# package-distribution Specification

## Purpose
Defines how RelKit is packaged and versioned for applications: one core package named `relkit`, a
`@relkit/*` scope for integrations and optional tools, and one shared release version.

## Requirements

### Requirement: Core package

The `relkit` package SHALL provide every API an application imports at run time — functions,
services, routes, events, jobs, cache, buckets, schemas, config, agent declarations and the runtime
— from its root and from focused subpaths such as `relkit/functions` and `relkit/events`.

#### Scenario: Application imports core APIs

- **WHEN** an application imports `defineFunction` and `defineService` from `relkit`
- **THEN** both resolve without installing any `@relkit/*` package

#### Scenario: Focused subpath import

- **WHEN** an application imports `defineEvent` from `relkit/events`
- **THEN** it receives the same export as the root import

### Requirement: Optional packages live under the @relkit scope

Third-party integrations and first-party tools that a production server does not need SHALL be
published under `@relkit/*`, including `@relkit/cli`, `@relkit/client`, `@relkit/testing` and
`@relkit/inspector`, and SHALL NOT be dependencies of `relkit`.

#### Scenario: Production install

- **WHEN** a production server installs only `relkit` and its selected integrations
- **THEN** the compiler, TypeScript, testing helpers, the Inspector UI and the frontend client are
  absent from the installed dependency tree

### Requirement: Command launcher

The `relkit` package SHALL provide a `relkit` command that runs the project's installed
`@relkit/cli`, and SHALL exit with a coded message naming the package to install when `@relkit/cli`
is missing.

#### Scenario: CLI not installed

- **WHEN** a developer runs `relkit dev` in a project without `@relkit/cli`
- **THEN** the command exits non-zero with a coded message that names `@relkit/cli` and how to
  install it

### Requirement: One release version

`relkit`, `create-relkit` and every `@relkit/*` package SHALL be released together with the same
version number, and the release tag SHALL match that version.

#### Scenario: Release is cut

- **WHEN** any package changes and a release is published
- **THEN** every RelKit package is published at the same new version and the Git tag names that
  version

### Requirement: Consolidated framework packages

The framework SHALL be published as `relkit`, `@relkit/cli`, `@relkit/client`, `@relkit/testing`,
`@relkit/inspector` and `create-relkit`, plus integration packages. No package SHALL exist only to
make internal workspace dependencies resolvable.

#### Scenario: Published package inventory

- **WHEN** the release manifest is generated
- **THEN** it lists only the six framework packages and integration packages, and every listed
  package has public documentation

### Requirement: No internal subpaths

Published packages SHALL NOT expose `internal` subpath exports, and public type declarations SHALL
NOT reference unpublished or internal modules.

#### Scenario: Export map inspection

- **WHEN** the packed export maps and declarations of all packages are scanned
- **THEN** no export path contains an `internal` segment and no declaration imports an internal
  module

### Requirement: Deprecated legacy package

A final `@relkit/app` release SHALL re-export `relkit` and SHALL be marked deprecated on npm with a
message that points to `relkit` and the migration guide.

#### Scenario: Existing app installs the legacy package

- **WHEN** a project installs the final `@relkit/app`
- **THEN** its imports keep working and the package manager shows the deprecation message

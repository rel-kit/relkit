## ADDED Requirements

### Requirement: Every scaffold kind has executable template coverage

Acceptance verification SHALL run every add kind against temporary projects generated from the minimal, API, and agent templates and SHALL require the resulting project to pass `relkit check`. Service bundle snapshots SHALL verify both deterministic files and normalized graph relationships.

#### Scenario: Full bundle is tested across templates

- **WHEN** the generator acceptance matrix adds a full service to each template
- **THEN** every project checks successfully and the normalized relationship snapshots agree

### Requirement: Discovery and route generation cover ambiguity and path shapes

Tests SHALL cover discovery with multiple services, functions, events, tools, prompts, models, and custom profiles, plus root, static, dynamic, required catch-all, optional catch-all, normal route, service route, and route-method collision behavior.

#### Scenario: Dynamic nested route is generated

- **WHEN** `/users/:id/details` is supplied
- **THEN** acceptance verifies the route file at `src/routes/users/[id]/details/route.ts` and the compiler recovers the same route path

### Requirement: Singleton scaffolds cover every supported dialect

Tests SHALL cover standalone database and auth-chained database generation for SQLite, PostgreSQL, and MySQL, including singleton collisions, schema export collisions, dialect-specific drivers, and Better Auth tables and mounts.

#### Scenario: Auth chains MySQL database creation

- **WHEN** auth generation selects MySQL in a project without a database
- **THEN** the generated project checks with the MySQL Better Auth schema and contains no generic `items` table

### Requirement: Transaction rollback is proven under injected failures

Acceptance tests SHALL inject installation and validation failures and prove removal of new files, restoration of previous bytes, file modes, and lockfile, and preservation of unrelated dirty files.

#### Scenario: Installation mutates lockfile then fails

- **WHEN** an injected installer changes `bun.lock` before returning failure
- **THEN** rollback restores the exact original lockfile and all scaffold-touched paths

### Requirement: Packed creation and interaction paths are equivalent

Packed-artifact smoke tests SHALL exercise both creation entrypoints, interactive choices through an injected prompt driver, and chained headless add commands, with prompts and progress absent from JSON output.

#### Scenario: Prompt driver and flags choose the same project

- **WHEN** an injected prompt sequence and explicit flags resolve identical create and add choices
- **THEN** their normalized results and generated project bytes are identical

### Requirement: Provider runtime and documentation evidence is complete

Verification SHALL cover local event/job runtime registration and lifecycle, use the existing opt-in Docker suite for Redis and MinIO, and regenerate and test CLI, onboarding, add-command, database/auth, and local-provider documentation without adding containers or cloud cost.

#### Scenario: Repository verification runs locally

- **WHEN** the change is prepared for release without cloud authorization
- **THEN** CLI, compiler, local-provider, generator, integration, docs, typecheck, guardrail, and full local verification suites pass while cloud acceptance remains skipped

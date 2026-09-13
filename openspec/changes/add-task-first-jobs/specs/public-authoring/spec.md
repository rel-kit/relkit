## ADDED Requirements

### Requirement: TJ-044 Dot-access job names

Authored jobs MUST declare a literal camelCase `name` with the validation and uniqueness rules specified below. Generated clients, hook selectors, context aliases and Inspector usage MUST use identifier-safe names. No generator may silently normalize IDs into names or produce bracket-only job keys. Names SHALL be 1–64 ASCII characters matching `^[a-z][A-Za-z0-9]*$`, with no trimming/sanitization. The reserved set is `then`, `constructor`, `prototype`, `toJSON`, `toString`, `valueOf`, `hasOwnProperty`, `isPrototypeOf`, `propertyIsEnumerable`, `toLocaleString`, and `__proto__`. Uniqueness SHALL cover all private/exposed/implicit/explicit jobs across the application; context aliases use the same grammar.

#### Scenario: Dot-access job names

- **WHEN** a job uses name "exportOrders" and id "orders.export"
- **THEN** client.jobs.exportOrders.trigger and runs.watch typecheck, while invalid/reserved/colliding names fail without normalization

### Requirement: TJ-045 Naming does not reset durable identity

Relkit MUST keep API names separate from resolved durable IDs in manifests, generated metadata and execution routing. Renaming a public name MUST change the client contract; preserving a pinned durable ID MUST preserve historical run/schedule/dedup routing. A rename that also changes a default-derived ID MUST require an explicit identity migration.

#### Scenario: Naming does not reset durable identity

- **WHEN** the public name changes to exportAccountOrders while id "orders.export" remains pinned
- **THEN** the public fingerprint changes but durable schedule, deduplication and historical run routing remain unchanged

### Requirement: Distinct function and task authoring

Functions SHALL own immediate business handlers and tasks SHALL own background handlers. Jobs SHALL target only tasks and schedules SHALL submit jobs. Routes and tools SHALL continue targeting callable functions, event functions SHALL remain event-only functions, and agents SHALL retain their existing generated/native execution. Path-scoped route middleware SHALL retain HTTP handlers. Services SHALL group original members without owning a business handler or invocation policy.

#### Scenario: Non-function handler is declared

- **WHEN** application code attempts to put a business handler on a route, job, event-trigger, tool, or service descriptor
- **THEN** the public type contract or descriptor validation rejects it

#### Scenario: Route middleware is declared

- **WHEN** application code calls `defineMiddleware(path, handler)`
- **THEN** it receives a stable middleware descriptor whose handler receives an HTTP context, continuation, and base RELKIT execution context without targeting a function

#### Scenario: Function invokes another function

- **WHEN** a handler calls `target.invoke(input)`
- **THEN** no parallel function dependency declaration or `context.functions` client is required

#### Scenario: Managed dependency is declared

- **WHEN** a function declares a task, job, bucket, cache, or agent dependency, or declares exact publishes event IDs
- **THEN** its handler and lifecycle hooks expose only the correspondingly named and typed Promise-based clients

### Requirement: Task exports support deterministic private bindings

Task discovery SHALL preserve canonical source exports, recognize named bindings/default aliases of the same descriptor, deduplicate re-exports, and require explicit named jobs when an implicit source name cannot be resolved unambiguously. Recommended domain task/job paths SHALL not exclude otherwise valid descriptors.

#### Scenario: Named task export

- **WHEN** a named task is exported from its domain task file
- **THEN** no default-export-only warning is emitted and its unique valid source name supplies the private implicit binding

### Requirement: Job service spelling migration does not enable legacy execution

For one compatibility release, task-target job options SHALL accept deprecated profile as an exclusive alias of service with a migration diagnostic. Both spellings together SHALL fail. This alias SHALL preserve task execution and SHALL not require or enable the separate legacyJobs execution gate.

#### Scenario: Task job uses a deprecated profile spelling

- **WHEN** a task-target job uses profile without service or legacyJobs
- **THEN** it resolves the same service with a deprecation diagnostic and retains trigger-only task semantics

## MODIFIED Requirements

### Requirement: defineApp is the canonical application contract

`defineApp` SHALL remain the sole immutable application configuration constructor. It SHALL accept plural `jobs` and `defaults.jobs` over the existing internal `job` capability, existing singular other capabilities, environment, telemetry, server, Inspector and deployment. One-release `job`/`defaults.job` aliases SHALL issue migration diagnostics and conflict with their new spellings. Explicit `compatibility: { legacyJobs: true }` SHALL enable the deprecated legacy descriptor runtime only.

#### Scenario: Direct cache binding is authored

- **WHEN** an application passes `docker(redis())` to singular key `cache`
- **THEN** type inference retains the Redis adapter contract and normalization creates profile `default`

#### Scenario: Multiple cache bindings are authored

- **WHEN** `cache` is a map containing `requests` and `timeline`
- **THEN** logical cache descriptors can select either profile and no environment-specific provider branch is needed

### Requirement: Stable immutable descriptors

Every compiled descriptor SHALL retain a stable ID, kind, global descriptor brand, typed reference, serializable metadata and immutability. Task ID and semantic version SHALL be explicit. An explicit job SHALL require a literal name and resolve omitted durable id to that name; an implicit job SHALL retain its task ID. Application/event/bucket/cache IDs SHALL remain explicit; existing function/route/service/tool/agent/error/middleware/transform inference SHALL remain supported. Task and job namespaces SHALL permit one task and one job with equal durable IDs while graph identities remain distinct; all collisions within required uniqueness scopes SHALL fail.

#### Scenario: Descriptor is mutated in development

- **WHEN** application code attempts to mutate a descriptor after creation
- **THEN** the mutation fails rather than silently changing compilation behavior

#### Scenario: Explicitly identified descriptor source moves

- **WHEN** a descriptor with an explicit ID moves to another source path without changing its ID or contract
- **THEN** its logical graph and deployment identity remain unchanged apart from source-location metadata

#### Scenario: Inferred descriptor source moves

- **WHEN** a descriptor with an inferred ID moves to a different identity-bearing hierarchy
- **THEN** compilation deterministically derives the new ID and compatibility output reports the logical identity change

#### Scenario: Inferred identities collide

- **WHEN** two distinct descriptors derive the same stable ID within a required uniqueness scope
- **THEN** compilation fails with a collision diagnostic identifying both source bindings and suggests an explicit override

### Requirement: Conventions warn without excluding descriptors

Recommended directories, suffixes, grouping, and ID style SHALL continue to produce non-fatal diagnostics for branded descriptors, except that HTTP routes SHALL use the required `src/routes/**/route.ts` named-method convention because the source path defines their public URL and method.

#### Scenario: Valid non-route descriptor uses the wrong path

- **WHEN** a branded bucket descriptor is exported outside `src/buckets/**/*.bucket.ts`
- **THEN** compilation includes it and emits a convention warning without a non-zero exit solely for that warning

#### Scenario: Route uses the wrong path

- **WHEN** a route descriptor is exported outside `src/routes/**/route.ts`
- **THEN** compilation rejects it with a migration diagnostic because its method/path cannot be derived from the required convention

## REMOVED Requirements

### Requirement: Function-only authored execution

**Reason**: Background tasks now own their own handlers; the old exclusive function model conflicts with task execution.

**Migration**: Keep functions immediate, extract background handlers into defineTask and bind jobs to tasks. Routes, event functions, tools, middleware and agent execution retain their existing owners. The replacement requirement below preserves their existing scenarios.

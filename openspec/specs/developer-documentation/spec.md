## Purpose

Provides one searchable, generated, executable source of truth that teaches developers how to create, use, inspect, test, and operate every public RELKIT capability.

## Requirements

### Requirement: Searchable documentation application

RELKIT SHALL provide a buildable documentation application with keyboard-accessible search across conceptual guides, generated API reference, CLI reference, migration guidance, and troubleshooting content.

#### Scenario: Developer searches for route uploads

- **WHEN** a developer searches the documentation for upload or multipart behavior
- **THEN** results link to the route guide, schema/API reference, and an executable example covering limits and validation

### Requirement: Complete task-oriented guides

Documentation SHALL cover project creation, application/configuration, every public descriptor and runtime feature, all HTTP methods and segment/input forms, middleware, rate limiting, events/jobs, resources, tools/agents, CLI commands, local development, testing, observability, deployment, and troubleshooting without describing planned behavior as implemented.

#### Scenario: Developer follows a feature guide

- **WHEN** a developer follows any documented public feature from a clean generated project
- **THEN** the imports, types, commands, runtime behavior, failure modes, and verification steps match the released implementation

### Requirement: Generated public API reference

Application-facing exports SHALL produce deterministic API reference pages from rich TypeScript documentation containing descriptions, categories, version metadata, examples, links, and important constraints; internal and generated implementation exports SHALL be excluded.

#### Scenario: Public export lacks documentation

- **WHEN** an application-facing export lacks required description, category, version, or executable example metadata
- **THEN** documentation verification identifies the export and fails

### Requirement: CLI reference shares command metadata

The CLI reference SHALL be generated from the same command tree that renders terminal help, including nested commands, flags, defaults, examples, environment variables, exit behavior, and machine-output guarantees.

#### Scenario: CLI option changes

- **WHEN** an option is added, removed, or renamed in the command tree
- **THEN** regenerated CLI pages and help output change together and stale reference output is rejected

### Requirement: Executable canonical examples

Documentation SHALL point to a canonical commerce workspace example that exercises every public feature, and critical snippets SHALL be type-checked or executed rather than maintained as unverified copies.

#### Scenario: Example behavior drifts

- **WHEN** an API change breaks a documented snippet or canonical example flow
- **THEN** the owning example/documentation check fails before release

### Requirement: AI-readable documentation output

The documentation build SHALL expose concise and full plain-text indexes generated from the same released sources without secrets, internal implementation details, or conflicting API descriptions.

#### Scenario: AI-readable index is requested

- **WHEN** a client loads `/llms.txt` or `/llms-full.txt`
- **THEN** it receives current navigable public documentation derived from the same source as the site

### Requirement: Domain service migration is documented and executable

Documentation SHALL teach grouped service-first layout, continued valid flat-layout support, generic and specialized service APIs, service-aligned routes, public/internal Inspector behavior, and a complete migration from removed layer-first, middleware, data-model, and Better Auth adapter forms. The optional flat-to-grouped migration SHALL be documented separately from those breaking API migrations, with executable preview, apply, validation, no-op, conflict, and rollback examples. Archived OpenSpec changes SHALL remain historical rather than being rewritten to imply grouped layout was previously supported.

#### Scenario: Existing application is migrated

- **WHEN** a developer follows the breaking-change migration guide
- **THEN** its imports, directory moves, service facade, database/auth setup, checks, and runtime behavior match the released APIs and canonical examples

#### Scenario: Valid flat application adopts grouping

- **WHEN** a developer follows the flat-to-grouped guide
- **THEN** the guide explains that migration is optional, demonstrates stopping development and previewing edits, identifies manual blockers, and verifies unchanged identities and persistent resources after apply or rollback

### Requirement: Documentation teaches event functions and explicit publication

Documentation and generated API references SHALL describe `defineEvent`, `defineFunction.publishes`, `defineEventFunction`, exact event IDs, narrowed publisher context, independent delivery, and event trigger context, and SHALL contain no supported `onEvent`, selector, or `dependencies.events` guidance.

#### Scenario: Event guides are generated

- **WHEN** documentation generation completes
- **THEN** the event and listener guides use executable repository examples of publishers and event functions and preserve asynchronous receipt/fan-out semantics

### Requirement: Documentation teaches the complete integration workflow

Task-oriented guides SHALL use executable canonical sources to explain `defineApp`, handler-visible environment values, binding-local named values, direct/profile bindings, connected adapters, `docker(adapter)`, infrastructure wrappers, explicit test replacements, local commands, mixed-provider deployment, and release-source diagnostics.

#### Scenario: Developer learns docker Redis

- **WHEN** a reader follows the local integration guide
- **THEN** it demonstrates `docker(redis())`, `docker(redis({ url }))`, `dev --local=off`, health behavior, persistence, and the fact that Docker never participates in deployment

#### Scenario: Developer configures two cache servers

- **WHEN** a reader needs separate request and timeline caches
- **THEN** the guide uses two physical profiles and explains logical cache profile selection separately from request-derived rate-limit keys

### Requirement: Documentation teaches telemetry and Inspector together

Observability and Inspector guides SHALL show redaction and complete bounded local persistence before external sampling, concurrent Sentry and OTLP exporters, local exporter diagnostics, and AWS host routing to CloudWatch Logs.

#### Scenario: Export sampling is configured

- **WHEN** a reader lowers the external trace sample rate
- **THEN** the guide states and demonstrates that Inspector logs and traces remain locally available

### Requirement: Landing page presents local-to-cloud integrations

The existing landing page SHALL reuse its component and visual system while presenting an executable `defineApp` example, concise standalone and catalog imports, `docker(redis())` behavior, `aws(s3())` local-to-cloud behavior, and Inspector telemetry visibility with links to the corresponding guides.

#### Scenario: New developer evaluates RelKit

- **WHEN** the landing page is rendered on desktop or narrow viewport
- **THEN** the developer can understand the local-first workflow, how deployment ownership differs from connected services, and where to learn about integrations and Inspector without encountering removed APIs

### Requirement: Generated reference inputs match the new APIs

Public source JSDoc, CLI help metadata, guide and feature catalogs, canonical examples, templates, repository documentation, search output, and AI-readable documentation SHALL use the same `defineApp` and integration contract; generated navigation and API/CLI reference pages SHALL not be hand-edited.

#### Scenario: Documentation is generated and checked

- **WHEN** documentation generation, reference checks, link/search tests, and the site build run
- **THEN** no active page, landing snippet, catalog entry, or generated reference contains the removed provider APIs

### Requirement: TJ-039 Docs and scaffold parity

Documentation, generated reference and scaffold examples MUST match the implemented API and feature matrix.

#### Scenario: Docs and scaffold parity

- **WHEN** a fresh packed application follows the documented quickstart and copied examples
- **THEN** all commands, exports, names and schemas match generated declarations and execute without unpublished dependencies

### Requirement: Task and jobs documentation is complete and generated from executable sources

Documentation SHALL cover the full page set and example matrix in this change's design section 17: vocabulary, quickstart, tasks, bindings/names, duration/sleep, execution policy, retry/idempotency, client/controllers/React/SSR, progress/streams, security, schedules, Inspector, Docker, deployment, testing, migration, troubleshooting and three provider guides/comparison. Existing function/service/event/agent/graph/realtime/client/config/CLI/deploy pages SHALL cross-link accurate semantics. API and CLI reference SHALL regenerate from exports and examples, with navigation/search/links and legacy redirects validated.

#### Scenario: Old jobs URL is visited

- **WHEN** a reader follows a previous define/enqueue/first-job/retries/idempotency/schedules link
- **THEN** the destination identifies legacy migration or the new task contract instead of silently teaching function-target jobs

#### Scenario: Copied example needs a helper

- **WHEN** documentation demonstrates an idempotent mail/export helper
- **THEN** the complete simulated helper exists in its authoritative executable fixture rather than as a nonexistent framework export

#### Scenario: React example triggers and recovers work

- **WHEN** a user runs the documented React export example
- **THEN** it retains the accepted runId and original request/key, observes the selected run, handles unknown outcomes without fresh-key resubmission, and creates no IDs or live connections during server rendering

### Requirement: Application placement reference distinguishes rules from guidance

Documentation SHALL provide a complete application directory reference covering grouped generic and specialized services, Routes, Platform environment/configuration support, migrations, operational scripts, tests, environment examples, and framework-managed output. All remaining normative obligations below SHALL also hold.

#### Scenario: All normative obligations are evaluated

- **WHEN** implementation or final acceptance evaluates this requirement
- **THEN** all of the following remaining obligations hold:

It SHALL distinguish compiler-enforced roots, ownership and boundaries from convention warnings and ordinary TypeScript organization. Policies, integration helpers, templates, agent models/middleware, schemas, and configuration fragments SHALL NOT be described as new automatic registration mechanisms. Optional directories SHALL be illustrated without requiring them in minimal generated projects.

#### Scenario: Developer locates an existing capability

- **WHEN** a developer consults the reference for database schema/models/overrides, auth plugins/hooks, events/jobs, realtime channels, agent tools/prompts/models, cache/buckets, or service-specific policies/templates
- **THEN** the reference places it beneath its owning service and links to its existing public contract without inventing an API or moving specialized service ownership into Platform

#### Scenario: Developer configures the environment

- **WHEN** a developer follows the Platform configuration and environment guide
- **THEN** it shows explicit composition from `relkit.config.ts`, distinguishes application environment contracts from binding references, documents actual dotenv loading and reserved `RELKIT_ENV`, and does not equate CLI environment selection with loading an example file

#### Scenario: Examples and generated guidance are verified

- **WHEN** documentation, source includes, CLI/API references, generated READMEs, canonical examples, and coding-agent guidance are checked
- **THEN** paths and commands agree with their selected application layout and current creation certification, including the unchanged fullstack wrapper, without hand-editing generated reference output

### Requirement: Repository skills match the implemented application layout

Repository-owned application, documentation, deployment, and structural-guidance skills SHALL be audited and updated where affected in the same implementation delivery as grouped layout. All remaining normative obligations below SHALL also hold.

#### Scenario: All normative obligations are evaluated

- **WHEN** implementation or final acceptance evaluates this requirement
- **THEN** all of the following remaining obligations hold:

Coverage SHALL include skill entrypoints, linked references, examples, bundled scripts/templates, agent instructions, and any distributed guidance copies. Instructions SHALL teach grouped defaults, preserve supported flat applications, describe optional safe migration, and match certified CLI choices. Historical flat examples SHALL be explicitly labeled. Generic unaffected skills SHALL have a recorded no-change disposition; globally installed and third-party skills SHALL NOT be rewritten as an implicit side effect.

#### Scenario: Application skill is followed after implementation

- **WHEN** a developer follows the updated application skill to create a supported application or add a service artifact to an existing flat application
- **THEN** new output uses grouped roots, existing flat output remains flat, and the instructions do not require unsupported CLI tuples or new public Effect authoring APIs

#### Scenario: Supporting skill asset contains a stale path

- **WHEN** a linked skill example, reference, template, script, or distributed copy still teaches the flat path as the only supported layout or references a removed source location
- **THEN** guidance validation fails until the authoritative source and affected copies are updated or the example is explicitly retained as compatible flat or historical guidance

#### Scenario: Migration instructions are followed

- **WHEN** the skill's documented preview, write, and rollback sequence is exercised on a fixture
- **THEN** commands match the implemented CLI, preview is nonmutating, and migration/rollback preserve logical identities and persistent resources

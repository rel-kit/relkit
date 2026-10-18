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

### Requirement: Application skills adapt to task intent

Application skills SHALL infer feature, bug, discussion, and mixed requests from context and extend the existing verification workflow. Explicit implementation requests SHALL authorize work after a short plan; further questions SHALL be limited to unresolved decisions materially affecting scope, security, cost, or destructive actions.

#### Scenario: Feature implementation is requested

- **WHEN** a user requests a new feature
- **THEN** the agent establishes the problem, scope, expected behavior, and acceptance criteria, resolves material missing decisions, and presents a short implementation and verification plan before editing
- **AND** it proceeds within the requested scope without a repetitive approval prompt

#### Scenario: A bug is reported

- **WHEN** a user requests a bug fix
- **THEN** the agent establishes expected versus actual behavior, attempts reproduction where possible, traces the affected execution path, distinguishes confirmed causes from hypotheses, and explains the fix and verification approach before editing
- **AND** an unavailable reproduction is reported as a limitation rather than presented as confirmed evidence

#### Scenario: Discussion is requested

- **WHEN** a user asks to discuss an approach without requesting implementation
- **THEN** the agent explains options, tradeoffs, and a recommendation without changing files

#### Scenario: A request combines discussion and implementation

- **WHEN** a request mixes task types
- **THEN** the agent separates the requested work and applies the relevant behavior to each part without requiring the user to classify it

### Requirement: Application onboarding resolves only missing decisions

Before scaffolding a new application, application skills SHALL establish the database engine and driver or an explicit no-database choice, and whether authentication is required. They SHALL ask unanswered choices together and reuse decisions already supplied or established in the project.

#### Scenario: Database and authentication are unspecified

- **WHEN** a new application request leaves both choices unresolved
- **THEN** the agent asks for database engine/driver or no database and authentication needs together before scaffolding

#### Scenario: Decisions are already known

- **WHEN** a user has specified the database and authentication choices or a project already establishes them
- **THEN** the agent reuses those choices without repeating onboarding questions

#### Scenario: A small change does not require onboarding

- **WHEN** the request is an unrelated bug fix or a small change in an established application
- **THEN** the agent does not restart database/authentication onboarding

#### Scenario: Authentication conflicts with the no-database choice

- **WHEN** the user requests no database and an authentication capability whose supported implementation needs persistence
- **THEN** the agent explains the conflict and resolves that choice before writing files, rather than silently adding a database or inventing unsupported auth behavior

#### Scenario: Agent onboarding uses existing CLI options

- **WHEN** the agent has established database and authentication choices for a new application
- **THEN** it uses supported create/add commands without inventing database/auth creation flags or changing the CLI's documented headless defaults

### Requirement: Optional modules require intentional selection

Application skills SHALL recommend only task-relevant optional modules, explain their benefit, and resolve necessary provider/configuration choices against the installed RELKIT version. They SHALL NOT silently add optional infrastructure or seek duplicate permission for capabilities the user explicitly requested.

#### Scenario: A useful optional capability is discovered

- **WHEN** realtime, agents, streaming, buckets, caching, events, or jobs would benefit the requested feature but were not requested
- **THEN** the agent briefly explains the concrete benefit and asks whether to include the relevant capability before expanding scope

#### Scenario: The capability was explicitly requested

- **WHEN** the user has requested order-status realtime updates
- **THEN** the agent resolves only missing provider/configuration decisions and verifies supported installed APIs without asking again whether realtime should be included

#### Scenario: A requested option is unavailable in the installed version

- **WHEN** the installed CLI or declarations do not support the selected module/provider option
- **THEN** the agent explains the limitation and supported alternatives before editing and does not invent an API or silently install different infrastructure

### Requirement: Application guidance defaults to backend resource contracts

Application guidance SHALL default to backend-only work and resource-specific endpoints with explicit contracts, validation, and applicable authorization. It SHALL preserve explicitly requested frontend functionality, intentional protocol handlers, service ownership, and route adapter placement.

#### Scenario: Backend resources are requested

- **WHEN** the user requests users and orders backend operations
- **THEN** the agent creates distinct resource endpoints instead of a public table dispatcher selected by an entity parameter
- **AND** it creates no unsolicited app.js, assets.css, frontend pages, demo interfaces, or frontend scaffolding

#### Scenario: Resource contracts are verified

- **WHEN** the agent exposes users and orders operations requiring authenticated access
- **THEN** acceptance checks each route's valid and invalid input behavior plus denied and allowed access, instead of treating distinct path names or auth-handler presence alone as sufficient

#### Scenario: Internal services and protocol handlers exist

- **WHEN** an application contains database tables, infrastructure-only services, or the authentication protocol handler
- **THEN** guidance does not require exposing every table or service and preserves the intentional auth handler
- **AND** shared internal implementation remains permitted without generic public table dispatch

#### Scenario: Frontend work is explicitly selected

- **WHEN** the user requests frontend work, selects fullstack functionality, or has existing frontend files
- **THEN** guidance respects the requested functionality and does not delete existing frontend work or disable it to enforce backend defaults

#### Scenario: Service and route files are authored

- **WHEN** the agent implements application behavior
- **THEN** service implementation stays beneath its owning service, new grouped projects use src/services/<name>, route adapters stay under src/routes, and the agent follows the current application layout

### Requirement: Migration guidance distinguishes history from machinery

Application guidance SHALL identify SQL migrations and required metadata as versioned application source owned by the database service, with one ordered history for a shared database. It SHALL teach the implemented generation and migration commands, explicit configuration, and RELKIT-owned execution without claiming scaffolding applies migrations.

#### Scenario: A database application is prepared

- **WHEN** a developer follows database or auth guidance
- **THEN** it places migration history alongside the owning database service, keeps that history outside ignored .relkit output, and explains environment setup, generation, review, and explicit application of migrations
- **AND** it does not split the shared database history across business services or copy reusable runner code into the application

### Requirement: Application completion is supported by behavior evidence

Application skills SHALL require focused verification after logical changes and complete affected-behavior verification before completion. Reports SHALL state what changed, what was verified and how, and failed, skipped, or blocked checks. A direct function test alone SHALL NOT establish HTTP-route or complete-flow correctness.

#### Scenario: HTTP bug verification completes

- **WHEN** a route bug is fixed
- **THEN** the agent reviews the diff, runs applicable checks, typechecking, build, unit/integration and existing relevant end-to-end tests, and replays the original failure through the HTTP route
- **AND** it reports any unavailable check or reproduction honestly

#### Scenario: Backend end-to-end coverage is needed

- **WHEN** a backend feature needs flow-level verification
- **THEN** the agent exercises backend/API behavior without creating an unsolicited frontend merely for testing

#### Scenario: Only partial checks pass

- **WHEN** code is written or unit tests pass but required runtime verification is blocked
- **THEN** the completion report identifies the remaining verification and does not claim fully verified delivery

### Requirement: Experimental development boundaries are explicit

Root contributor guidance SHALL state that RELKIT is experimental, interfaces are subject to change, and current consumers are repository samples. This change SHALL update samples directly without introducing legacy upgrade commands or compatibility layers, while preserving sample data and applied migration history.

#### Scenario: Sample migration paths change

- **WHEN** this change updates a repository sample's migration layout
- **THEN** the sample and its guidance are updated directly without resetting its database, changing applied migration identifiers, or building a legacy upgrade mechanism

### Requirement: Distributed application workflow guidance stays synchronized

Affected repository-owned skill entrypoints, references, examples, template copies, and packaged guidance SHALL describe the same task workflow and implemented commands. Verification SHALL cover both distributed content and representative behavior scenarios; global and third-party skills SHALL NOT be implicitly modified.

#### Scenario: A packed template ships application guidance

- **WHEN** a maintained template is packaged
- **THEN** its skill and relevant references contain the updated workflow, resolve their links, and agree with installed commands and supported capabilities

#### Scenario: Behavioral acceptance is evaluated

- **WHEN** the workflow guidance is accepted
- **THEN** evidence includes representative feature, bug, discussion, onboarding, module-selection, and backend/endpoint scenarios rather than only keyword-presence assertions

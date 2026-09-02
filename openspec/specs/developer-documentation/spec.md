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

Documentation SHALL teach the domain-first layout, generic and specialized service APIs, service-aligned routes, public/internal Inspector behavior, and a complete migration from removed layer-first, middleware, data-model, and Better Auth adapter forms.

#### Scenario: Existing application is migrated

- **WHEN** a developer follows the breaking-change migration guide
- **THEN** its imports, directory moves, service facade, database/auth setup, checks, and runtime behavior match the released APIs and canonical examples

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

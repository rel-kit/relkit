## ADDED Requirements

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


## ADDED Requirements

### Requirement: Integrations are independently installable workspace packages

The workspace SHALL register a top-level integrations catalog and independently publishable packages for Redis, S3, Docker, local services, Cloudflare, AI SDK, Sentry, OTLP, AWS, and Pulumi. Each package SHALL own its exports, project reference, build/check/test participation, public documentation, packed-package verification, and release classification.

#### Scenario: Application installs only Redis

- **WHEN** it depends on `@relkit/redis`
- **THEN** package resolution and generated runtime output do not require S3, AWS, Pulumi, Sentry, OTLP, or their SDKs

#### Scenario: Application installs the catalog

- **WHEN** it imports `@relkit/integrations/redis`
- **THEN** the side-effect-free subpath re-exports the same public Redis constructor as `@relkit/redis`

### Requirement: Integration dependency direction is enforced

Core authoring, compiler, graph, engine, runtime, testing, CLI, and deployment-contract packages SHALL NOT depend on concrete integrations; standalone integrations MAY depend on core protocols; the catalog MAY depend on standalone integrations; generated applications SHALL statically import selected standalone runtime exports.

#### Scenario: Core package imports an integration

- **WHEN** boundary validation finds a concrete integration dependency in core
- **THEN** repository checks fail without weakening structural allowlists

### Requirement: Static integrations do not create a plugin marketplace

RelKit SHALL allow branded descriptors to select installed package exports statically, but SHALL NOT accept user-authored runtime callbacks, arbitrary implementation paths, filesystem discovery, remote installation, automatic third-party discovery, or a plugin marketplace.

#### Scenario: Configuration names a filesystem runtime module

- **WHEN** an application attempts to load an integration by path
- **THEN** authoring or compilation rejects it before code execution

### Requirement: Repository topology guidance remains executable

Workspace manifests, TypeScript references, Turbo participation, boundary tests, package export smoke tests, public API/JSDoc checks, Konsistent validation/audit, package packing, changesets, and repository guidance SHALL cover the integrations workspace without exemptions for new package names.

#### Scenario: New integration package is added

- **WHEN** its package shell or entry barrel violates existing structural rules
- **THEN** normal repository checks fail and no wildcard rule is weakened to admit it

## REMOVED Requirements

### Requirement: Explicit POC scope guardrails

**Reason**: The previous wording prohibits all plugins without distinguishing trusted statically installed integration modules from dynamic plugin systems.

**Migration**: Apply the static integration guardrail above while continuing to prohibit callbacks, dynamic paths, discovery, remote installation, and marketplaces.

#### Scenario: Static installed integration is selected

- **WHEN** a branded descriptor references its owning package export
- **THEN** the selection is allowed subject to identity and protocol validation


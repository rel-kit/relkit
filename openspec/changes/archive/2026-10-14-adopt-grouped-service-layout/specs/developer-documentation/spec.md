## MODIFIED Requirements

### Requirement: Domain service migration is documented and executable

Documentation SHALL teach grouped service-first layout, continued valid flat-layout support, generic and specialized service APIs, service-aligned routes, public/internal Inspector behavior, and a complete migration from removed layer-first, middleware, data-model, and Better Auth adapter forms. The optional flat-to-grouped migration SHALL be documented separately from those breaking API migrations, with executable preview, apply, validation, no-op, conflict, and rollback examples. Archived OpenSpec changes SHALL remain historical rather than being rewritten to imply grouped layout was previously supported.

#### Scenario: Existing application is migrated

- **WHEN** a developer follows the breaking-change migration guide
- **THEN** its imports, directory moves, service facade, database/auth setup, checks, and runtime behavior match the released APIs and canonical examples

#### Scenario: Valid flat application adopts grouping

- **WHEN** a developer follows the flat-to-grouped guide
- **THEN** the guide explains that migration is optional, demonstrates stopping development and previewing edits, identifies manual blockers, and verifies unchanged identities and persistent resources after apply or rollback

## ADDED Requirements

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

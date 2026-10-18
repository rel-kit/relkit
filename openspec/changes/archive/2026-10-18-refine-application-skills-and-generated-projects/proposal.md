# Proposal

## Why

Generated application guidance needs a task-driven path from understanding a request to verified delivery, with backend defaults and deliberate infrastructure choices. Current database scaffolding copies migration machinery into applications and ignores migration history. The current Drizzle compatibility patch remains required and is retained unchanged by explicit user direction.

## What Changes

- Extend the application skill's existing workflow with feature planning, evidence-based bug diagnosis, read-only discussions, contextual onboarding, relevant module recommendations, and explicit verification reporting.
- Default to backend-only application work and resource-specific endpoint contracts while preserving explicitly requested frontend functionality and intentional protocol handlers.
- Ignore all of `.relkit/` in applicable templates while keeping database migration SQL and required metadata trackable.
- Preserve the current Drizzle patch, dependency pins, catalog registrations and portable distribution; verify strict standalone installation and database/auth behavior with that explicit packaged repair.
- **BREAKING**: Put new scaffold migration history beneath its owning database service and move reusable execution behind `relkit db migrate --config <path>`, retaining `db:generate` and `db:migrate`. The selected configuration owns the target database and history; unrelated commands and no-database applications remain independent of optional migration dependencies.
- Update repository samples directly and document experimental status in root `AGENTS.md`; do not add legacy-app upgrade commands or compatibility layers.
- Require behavior-focused skill evaluation, packed standalone consumer evidence, and fresh/previously migrated database acceptance before implementation is complete.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `developer-documentation`: Task-driven application skills, deliberate onboarding and module suggestions, backend/endpoint conventions, migration ownership guidance, experimental status, and evidence-based completion.
- `cli-scaffolding`: Complete generated ignore rules, preserved portable Drizzle repair, service-owned tracked migration history, and RELKIT-owned migration execution.

## Impact

Affected implementation areas include generated skill copies and references, repository-owned application guidance, create/add renderers, dependency catalogs and packaging, database tooling, generated scripts and configuration, root contributor instructions, repository samples, tests, and template certification evidence.

Implementation is authorized. The user's final scope decision is to complete the full change while keeping the Drizzle patch as-is; patch removal and replacement dependency research are no longer completion requirements. Earlier negative compatibility evidence remains historical. No Git mutation, release, deployment, paid infrastructure or changes to the separate release-readiness change are included. All remaining runtime, packaging, guidance and certification acceptance remains required; resource pressure requires waiting or reducing workload, not ending the authorized work.

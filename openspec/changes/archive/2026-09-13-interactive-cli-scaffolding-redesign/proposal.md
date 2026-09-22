## Why

RELKIT currently creates projects but leaves every later authoring step to manual file editing, making valid services, providers, routes, databases, and agents difficult to assemble consistently. A single context-aware CLI should generate those conventions safely while preserving the existing parser, diagnostics, and non-interactive behavior.

## What Changes

- Add an interactive TTY action menu and Clack-based prompts, previews, confirmations, notes, and finite-operation spinners while keeping Effect CLI parsing, help, completion generation, reporters, and exit semantics.
- Make `create-relkit` and `relkit create` use one create resolver and staged-project customization flow.
- Add `relkit add` commands for every current domain, route, provider, database, and auth authoring convention.
- Add transactional scaffold planning, conflict detection, byte-preserving canonical source edits, dependency installation, validation, rollback, structured warnings, next steps, and isolated JSON results.
- Add route-path inversion and the compiler source facts needed to discover callable functions exposed with `.asTool()`.
- Expose file-backed local event and job adapters and runtime registrations through `@relkit/local`.
- Extend generated CLI reference, onboarding, add-command, database/auth, and local-provider documentation and acceptance coverage.
- **BREAKING** Remove reliance on ad-hoc status output and require canonical editable source shapes for automated mutations; ambiguous dynamic, spread, and computed configuration shapes are rejected rather than rewritten.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cli-scaffolding`: Define interactive and headless create/add resolution, generated artifacts, transactions, results, failures, and JSON behavior.
- `domain-services`: Define generated domain bundles and their public/internal service relationships.
- `provider-bindings`: Define profile discovery and first-party provider configuration edits performed by scaffolding.
- `local-provider-services`: Define public local event/job authoring adapters and runtime registration.
- `acceptance-verification`: Define template, packed-artifact, rollback, provider, route, database, and auth acceptance coverage.

## Impact

The change affects `packages/cli`, `packages/create-relkit`, `packages/compiler`, `packages/local`, generated templates and examples, provider/profile configuration editing, documentation, and repository acceptance tests. It adds `@clack/prompts@1.7.0` as a direct runtime dependency without changing graph, manifest, or provider-protocol wire versions.

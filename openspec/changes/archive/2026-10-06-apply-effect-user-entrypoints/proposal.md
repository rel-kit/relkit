## Why

The generator and CLI still distribute orchestration, resource ownership, and failures across Promise-based workflows. Stable Effect v4 provides one service and lifetime model; a shared dependency catalog makes the upgrade reproducible across the workspace and published scaffolds.

## What Changes

- Upgrade Effect and its existing companion cohort to 4.0.1 and centralize shared external pins in Bun catalogs.
- Preserve exact pins, supported peer ranges, workspace boundaries, and portable concrete versions in packed/generated applications.
- Repair removed stable import paths and Drizzle SQL declaration compatibility with a portable, declaration-only patch.
- Apply Use Effect across every authored TypeScript file in create-relkit and CLI, preserving public adapters and using cohesive services, typed schemas/errors, observable operations, scoped resources, and deterministic test layers.
- Keep Clack; simplify interactive creation to a missing name and final confirmation, using minimal and no cloud/deploy/jobs defaults.
- Preserve explicit advanced/template flags, complete add flows, transactional rollback, and separate Docker startup consent after add.
- Review every changed TypeScript file independently at each phase and replay packed, native, browser, and demo acceptance before synchronizing unstaged changes back to the original checkout.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `workspace-foundation`: one shared dependency catalog and stable Effect cohort resolve reproducibly in source, release staging, and packed consumers.
- `cli-scaffolding`: shorter shared creation workflow and portable dependency-patch installation with transactional collision and rollback semantics.

## Impact

The architecture refactor covers packages/create-relkit and packages/cli, including tests and fixtures. Supporting changes affect shared manifests/lockfile, release/build tooling, the EffectMQ adapter and declaration evidence, and documentation. Public Promise/sync exports, error constructors/codes, result shapes, editor loading, JSON stdout, and generated RELKIT authoring APIs remain supported. The regression demo is used temporarily against the candidate worktree; its original manifests, links, and historical evidence are restored.

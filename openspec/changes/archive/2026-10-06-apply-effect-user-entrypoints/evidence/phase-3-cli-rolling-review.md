# Phase three CLI rolling review

Reviewer: root, independent of the CLI implementation author. This is a rolling
review record; it does not close the phase or assert final file hashes.

Reviewed complete source during the project/compiler milestone:

- `packages/cli/src/cli-errors.ts`
- `packages/cli/src/cli-runtime.ts`
- `packages/cli/src/services/filesystem.service.ts`
- `packages/cli/src/services/filesystem.types.ts`
- `packages/cli/src/services/compiler.service.ts`
- `packages/cli/src/services/compiler.types.ts`
- `packages/cli/src/services/modules.service.ts`
- `packages/cli/src/services/modules.types.ts`
- `packages/cli/src/services/project-capabilities.ts`
- `packages/cli/src/commands/check.ts`
- `packages/cli/src/commands/check-input.ts`
- `packages/cli/src/commands/check-result.ts`
- `packages/cli/src/commands/check-context-registry.ts`
- `packages/cli/src/commands/check-event-registry.ts`
- `packages/cli/src/commands/check-route-modules.ts`
- `packages/cli/src/commands/build.ts`
- `packages/cli/src/commands/build-stage.ts`
- `packages/cli/src/commands/build-activation.ts`
- `packages/cli/src/commands/build-jobs.ts`
- `packages/cli/src/commands/build-support.ts`
- `packages/cli/src/commands/build-manifest.ts`

Confirmed construction remains lazy, compiler effects retain their native process
and cancellation authority, expected native adapter failures have typed causes,
and public Promise adapters restore the original error. Independent source reads
are bounded and publication is masked across commit/rollback. Pure manifest and
container renderers remain synchronous. RcMap is inappropriate for cached module
namespaces because they have no acquired resource lifetime.

Findings delivered to the author, pending final verification:

1. Filesystem methods, cache hits/invalidation, and independently callable project
   helpers require shared execution observation in addition to named spans.
2. Module validation must retain the original namespace identity/live bindings;
   its schema/type belongs in the matching schema/type companions.
3. Method documentation and checked composition examples need complete coverage.
4. Reuse shared execution runners and retain the existing command presentation
   assertions, including ordinary JSON stderr behavior.
5. Stage/link/activation cleanup must retain separate evidence when cleanup fails,
   preserving the primary failure and successful publication contract.
6. Verify the jobs-manifest Schema migration preserves the established public
   invalid-manifest error boundary.
7. Cache tests must cover concurrent sharing, consumer interruption, last-consumer
   recovery, invalidation, and protection against an older pending load replacing
   a newer value. Transient failures remain uncached.

Effect compatibility review uses installed 4.0.1 source and exact upstream 4.0.1
Cache, Scope, ManagedRuntime, and Effect tests where the partial read-only vendor
checkout lacks the corresponding implementation/test. Shared source provenance
is recorded in the phase-four runtime review.

## Why

The execution packages combine partial Effect runtime ownership with Promise-based domain orchestration, manual timers and background tasks, and uneven operation instrumentation. Completing their service architecture makes dependency substitution, interruption, resource cleanup, and standalone observability reliable while preserving existing public behavior.

## What Changes

- Apply the complete use-effect workflow to every authored TypeScript file in runtime-effect, providers-local, engine, and runtime-hono, including tests and helpers.
- Compose coherent internal Context.Service contracts through live and deterministic test Layers; keep public synchronous and Promise APIs as compatibility boundaries.
- Own asynchronous workflows, background work, synchronization, state, configuration, failures, and resource lifetimes through applicable Effect capabilities.
- Decode untrusted boundaries with schema-derived contracts, preserve existing public errors and persisted/wire formats, and organize named type/schema companions.
- Instrument independently callable operations with bounded outcomes, workload counts, durations, meaningful logs, and existing tracing/sinks.
- Migrate all 73 package test suites and helpers into package-owned tests directories using Vitest and @effect/vitest; preserve Bun transport coverage with supervised child fixtures.
- Complete TSDoc contracts and checked examples, review every traversal/background task, and verify compatibility across the full execution chain.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `function-runtime`: composable internal execution services, replaceable Layers, and explicit generation/invocation/stream ownership.
- `provider-bindings`: local domain service substitution and scoped ownership while retaining durable semantics and public provider contracts.
- `http-runtime`: thin transport composition and distinct request, observation, and accepted-execution lifetimes.
- `observability`: bounded standalone domain instrumentation and inherited fiber-local logging configuration.

## Impact

- Primary scope is all authored TypeScript under the four execution packages; narrowly required manifests, runner scripts, fixtures, and current documentation references are included.
- Planning reviewed 338 authored TypeScript files (approximately 40,000 lines). Baseline package suites passed 252 tests, skipped one, across 73 suites.
- Preserve Effect 4.0.0-rc.115, public constructor/error identities, plain authoring/provider contracts, graph/manifest versions, persisted data formats, durable retries, filesystem locks, and existing transport semantics.
- Implementation uses one worktree with four package lanes after shared contracts are established, followed by dependency-ordered integration. Work remains uncommitted.
- The ignored, read-only reference at /Users/mustafaelsayed/Workspace/relkit/repos/effect is mandatory API evidence. It is incomplete; specific missing/mismatched sources use installed implementation/examples and focused regression evidence, with version-matched upstream only if still inconclusive.
- No cloud execution, deployment, dependency upgrade, vendor checkout repair, commit, or push is included.

# Workflow, source authority, and execution

Accept a feature/task brief, a new target path, or an existing file or directory.
Use this workflow for requested new implementations, extensions, and refactors.
Make cohesive domain Services, composed through live and test Layers, the primary
architecture. Effect owns workflows, models,
dependencies, failures, state, concurrency, and resource lifetimes. Service
operations are observable and interruptible by default. Implement the requested
behavior; preserve existing contracts except where the task explicitly changes
them, and preserve unrelated user changes. Work is complete only when scoped runtime
work actually flows through the service graph and typed failure policies. TSDoc,
type moves, examples, or a Service tag around unchanged Promise orchestration
are not substitutes for implementing that architecture. Preserve already-correct
Effect code; do not manufacture changes simply to show adoption.

## Execution and reporting

- Default to direct execution. Do not automatically create workers, worktrees,
  routing calls, scripts, per-symbol ledgers, or separate acceptance artifacts.
- Give an initial ETA and progress at least every 60 seconds while active:
  completed/total files, current work, blockers, and revised time remaining.
  Never weaken requirements to satisfy an estimate.
- Finish with coverage, meaningful changes, checks, exclusions/blockers, and
  actual elapsed time. Leave changes uncommitted in the intended checkout.

## Establish guidance once

- Resolve the scope, owning package, applicable AGENTS.md, existing changes,
  and pinned Effect version. For new code, establish its target location and
  intended contract from the request and neighboring modules; an existing target
  file is not required. Work in the user's intended checkout.
- Inventory all scoped authored files, including hidden/ignored files.
  Explicitly exclude dependencies, generated files, binaries, and vendor code.
  Read every authored file through EOF.
- REQUIRED: load [the Effect skill](../../effect/SKILL.md) once.
  For domain changes, read its references/SERVICES_LAYERS.md once. Follow its
  production defaults except where this skill explicitly refines them: use the
  [Data-versus-Schema error rule](implementation-standards.md#model-and-handle-failures-deliberately), retain this skill's type placement, and
  keep genuine per-call Context requirements. The service-owned make and strict
  authored-type rules in this skill also override conflicting prerequisite examples.
  Load other references only as needed: schemas, configuration, scheduling, caching, streams, HTTP or testing.
- For new implementations, extensions, and refactoring, apply scoped,
  behavior-preserving clarity principles (a code-simplification pass). This workflow
  keeps cohesive service/error/documentation changes together, batches relevant
  checks, and leaves changes uncommitted; it does not require separate PRs,
  per-helper full-suite runs, or automation solely because a diff is large.
- REQUIRED: verify each selected API/pattern against the read-only
  <project-root>/repos/effect implementation, documented examples/usages,
  and relevant tests. Confirm compatibility with installed dependencies.
  Reuse verified evidence throughout the task; research again only for a
  different pattern or unresolved signature.
- If vendor source is missing or mismatched, disclose the gap and use installed
  source, the [Effect v4 docs](https://effect.website/docs/v4/getting-started),
  and version-matched [upstream source/tests](https://github.com/Effect-TS/effect)
  as needed. Search exports, signatures, examples/usages, and tests for the actual
  responsibility before writing a custom abstraction; the capability index is
  not exhaustive. Installed compatibility wins over newer website examples.
  Do not silently upgrade dependencies or create/update the vendor checkout.
- Before implementing domain Services or failure handling, read
  [services and Context](services-and-context.md) and
  [errors and recovery](errors-and-recovery.md). These are the primary
  architectural acceptance rules; documentation supports their implementation.
- REQUIRED: read [tsdoc-comments.md](tsdoc-comments.md) once before documenting code.
  Apply its relevant tags and comment samples; do not insert every tag.
  Use [api-selection.md](api-selection.md) as the capability index for the 25 families.
  Read selected sections for APIs, Service/Layer usage, lifecycle/failure
  semantics, checks, and vendor source/test locations. Reuse this evidence;
  do not turn the catalog into a separate exhaustive research/reporting phase.
- Before choosing APIs, identify the domain's applicable guarantees: permitted
  dependencies, state transitions, atomic boundaries, ordering, partial failure,
  retry identity, and lifetime ownership. For new behavior, derive guarantees
  from the request and integration contracts. For refactors, preserve observed
  public behavior. Resolve unclear guarantees from callers, implementation, and
  tests where available; clarify material gaps before inventing behavior. Record
  useful contracts in the owning code/docs, not a separate per-symbol ledger.
  For substitutable adapters or stateful/concurrent services, read
  [contracts and behavioral tests](contracts-and-testing.md).
- Before choosing execution order or any coordination mechanism, read
  [concurrency and coordination](concurrency-and-coordination.md). Apply its
  selection and ownership rules together with all service/error/style gates.
- For callbacks that outlive registration, scoped background workers, or
  durable/delayed workflows, read the applicable sections of
  [lifecycle and durability](lifecycle-and-durability.md).
  Load persistence/recovery guidance only when that responsibility is in scope;
  preserve existing infrastructure and delivery guarantees.
- Load integration references only when scoped code or its owning adapters use
  that integration, including integrations required by the new implementation.
  Check imports and owning dependencies during the normal
  inventory; a dependency in an unrelated workspace is not a trigger.
  - Drizzle (`drizzle-orm`, including schema generators): read
    [Drizzle + Effect](drizzle-effect.md) once when relevant.
  - oRPC (`@orpc/*` procedures, middleware, or clients): read
    [oRPC + Effect](orpc-effect.md) once when relevant.
  Load both only when both apply. Follow each linked official guide on demand,
  verify installed versions/exports, and reuse evidence; do not pre-load these
  references or install/upgrade integrations merely to follow their examples.

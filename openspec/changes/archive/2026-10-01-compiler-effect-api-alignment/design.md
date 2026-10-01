## Context

See `proposal.md` for motivation and the two delta specs for behavioral contracts. The proposal reviews the current checkout, including extensive staged, unstaged, and untracked compiler work; it is not a comparison against a clean release.

The authored-file census is 250 files and 25,112 lines: 135 root source modules/companions, 59 discovery files, 28 jobs files, 25 test/fixture files, and three package/TypeScript configuration files. Dependencies, `dist`, build output, coverage, and `.turbo` are excluded. No authored source implementation exceeds 250 lines. Planning used this complete inventory/API census and targeted semantic reads of entrypoints, error recovery, native services, evaluator ownership, atomic writes, telemetry, contracts, and regression tests. Implementation must complete EOF reads of every authored file; this proposal does not certify every existing declaration or comment.

Root, compiler, installed Effect, and installed `@effect/vitest` agree on `4.0.0-rc.115`. The reference under `repos/effect` lacks its package manifest, core modules and core test files, `.agents/AGENTS.md`, and `LLMS.md`. Its retained code uses older import surfaces such as `effect/process`, `effect/sql`, and `effect/observability`; installed rc.115 uses `effect/unstable/*`. Treat retained source as usage evidence, not a version-matched API authority.

### Concrete review findings

| Area                      | Current evidence                                                                                                                                                                                                                                                                            | Required follow-through                                                                                                                                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package boundary          | `integration-package-source.ts` casts parsed JSON to `Record<string, unknown>`. A native-reader probe returned success with `null`.                                                                                                                                                         | Decode the root before record access; retain native read/JSON syntax context and distinguish shape rejection.                                                                                                                       |
| Standalone typed failures | `loadPackageEffect` and `runtimePackageEffect` throw tagged validation errors. A direct invalid-runtime-package probe produced a defect rather than a typed failure. Outer resolution repairs only some calls with `catchDefect`.                                                           | Yield expected failures in each independently callable operation; move validation stages to composable effects rather than depending on parent repair.                                                                              |
| Defect bridges            | `route-file.ts`, `integration-package-resolution.ts`, `runtime-integration-plan.ts`, and `generated-artifacts.ts` recover expected thrown errors with `catchDefect`.                                                                                                                        | Replace bridges with typed operations; preserve compatibility exceptions in thin outer adapters. Keep unknown getter/conversion defects observable.                                                                                 |
| Configuration             | `loadConfigEffect` uses `parsed.config!`; parse success is modeled as optional `config` plus issues. Configuration and evaluator option schemas largely supply types rather than decoding those inputs.                                                                                     | Represent parse success/rejection explicitly and use applicable schema validation without dropping unknown-key diagnostics, defaults, or accumulating fewer issues.                                                                 |
| Models                    | `normalize-types.types.ts` hand-models compiler-owned records; `SchemaResult` has `ok: boolean` with optional success fields; graph types largely relay existing contracts.                                                                                                                 | Reuse shared contracts, derive new compiler-owned boundary records from schemas, and make internal decision states exhaustive. Preserve live descriptor/schema values and published result shapes.                                  |
| Native services           | `CompilerPackageSourceLive` has anonymous methods and a casted JSON reader. `DiscoverySourceReader` and `JobWorkerStorage` already have named methods. `passExtractEffect` explicitly supplies the native source reader, so its callers cannot override that reader.                        | Name native operations; use `.of` and deliberate layer construction; expose a source-dependent core where orchestration currently overwrites caller services. Keep existing default-providing entrypoints as boundary conveniences. |
| Observability             | Shared observers already record monotonic duration, outcomes, and bounded labels. `loadPackageEffect`, `runtimePackageEffect`, and some jobs render operations have named spans without their own workload/outcome instrumentation. Many root operations supply empty workload callbacks.   | Instrument independently callable domain work, retain the pure-leaf exemption, and supply operation-specific input/output counts. Preserve existing metric names and evaluator logging suppression.                                 |
| Documentation             | Examples outside jobs are not covered by `jobs-documentation.test.ts`. `watch.ts` and `project-typecheck.ts` contain consecutive documentation blocks; leaf comments such as `readPort` describe an ordering result instead of a validated port. Some callable type literals remain inline. | Review actual contracts, check meaningful examples, remove duplicate/stale comments, and finish named companion types without fabricating aliases for every structural literal.                                                     |
| Resource ownership        | Evaluator processes use scoped readers, concurrent joining, deadlines, kill/reap finalizers; detector sessions register ownership before hook installation; atomic writes use exclusive temp acquisition and scoped cleanup.                                                                | Retain these implementations and tests; tighten only demonstrated gaps. Per-file atomic writes do not imply an all-files transaction.                                                                                               |

### Baseline verification

- `bun x vitest run packages/compiler/tests`: 22 files, 117 tests passed.
- `bun x tsc -p packages/compiler/tsconfig.tests.json --noEmit --pretty false`: passed.
- `bun test --timeout 15000 ./tests/compiler`: 32 files, 128 tests passed, including deterministic fixtures, canonical commerce compilation, evaluator failures/timeouts, and watch equality.
- `bun x prettier --check packages/compiler/src packages/compiler/tests`: passed.
- The initially unqualified `bun test ... tests/compiler` also selected a package Vitest test under Bun and failed at `@effect/vitest` initialization. The repository's explicit `./tests/compiler` path resolved this; no runner/dependency change is warranted.
- Full monorepo, graph Vitest, lint/boundary, Docker, and cloud acceptance were not run during proposal creation. These baseline passes do not prove the proposed fixes are implemented.

## Goals / Non-Goals

**Goals:** Complete the existing Effect refactor with truthful failure channels, replaceable native authority, execution-owned state/resources, standalone observability, and usable documentation. Preserve existing exports and legacy compatibility while adding explicit core contracts where needed.

**Non-Goals:** Dependency upgrades; repairing the reference checkout; new compiler watch servers, caches, event buses, retry policies, exporters, worker infrastructure, or graph/artifact protocol versions. Avoid introducing a service for every pure transformation.

## Decisions

### 1. Compose domain work and keep execution at boundaries

Use named `Effect.fn` operations and `Effect.gen` for compiler stages and independently meaningful validation/planning work. Preserve synchronous and Promise exports as thin adapters. Keep small string, ordering, hash, and AST leaf calculations direct within their owning workflows.

The installed implementation suspends the generator body but applies `Effect.fn` transforms during construction. Therefore transforms must build effects and defer workload/property access until execution. Re-running a workflow must allocate new mutable state. Retain sequential normalization pass ordering and sequential candidate evaluation because detector hooks replace process globals.

Do not replace native synchronous callback contracts with fiber execution. Throws remain appropriate at blocked native invocations and at legacy exceptions; expected failures inside domain operations are yielded. Avoid adding runtime services to pure helpers solely to satisfy an API checklist.

### 2. Use Schema at real boundaries and exhaustive internal states

Decode package manifest roots and compiler-owned boundary records with version-matched Schema APIs. Reuse shared graph, wire, diagnostic, registration, and Standard Schema contracts rather than duplicating them. Keep runtime schemas/errors/services in runtime modules and same-name Schema-derived types in `.types.ts` companions.

Use an internal tagged decision algebra for configuration parse success/failure where it removes the non-null assertion. Preserve the public configuration result and diagnostic shapes through projection. Consider Data for internal decisions and Schema tagged variants for encoded records; no new `_tag` fields enter existing wire formats merely for convenience.

Configuration validation must retain all existing diagnostics and their order, reject unsupported keys, and apply the same defaults. A single fail-fast structural decoder that silently strips unknown keys is unsuitable. Decode at the appropriate record/field boundary and preserve the current issue-collection policy. Do not encode closures or live Standard Schema validators as JSON records.

### 3. Translate expected failure once, at its owner

Return `Schema.TaggedError` failures directly from route, package, runtime-plan, artifact, and applicable request validation operations. Preserve original exception objects/messages at legacy adapters. Keep JSON parse/read failures contextual and map malformed package root shapes to a domain validation error before property access.

The normalization coordinator is an intentional exception-to-diagnostic supervision boundary, confirmed by existing tests. Preserve recoverable pass diagnostics and continuation there; retain observer defects and interruption. Do not globally remove cause recovery, swallow cleanup defects, or turn every native/programmer failure into an ordinary diagnostic. Test mixed cleanup/body causes and original thrown values where the implementation changes.

### 4. Make native authority replaceable without breaking convenience entrypoints

Use existing `Context.Service` dependencies for package metadata, source reading, and worker storage. Implement real services with named methods and `.of`; default effectful construction to `Layer.effect`. `Layer.succeed` remains valid for already-built static values and simple test services.

When an orchestration stage currently provides a native reader internally, extract a caller-provided core and compose it through the existing outer native convenience entrypoint. The core must not overwrite supplied services. Retain existing no-service convenience signatures, legacy exports, and their results; those conveniences instrument the owning core once. This avoids a source-reader requirement breaking otherwise synchronous existing callers.

Keep environment access in native adapters and use the existing `Config`/`ConfigProvider` allowlist path within evaluator work, including explicit empty strings. No default service reference may hide filesystem/process authority. Do not broaden package/source service APIs without a real consumer.

### 5. Retain tested resource and concurrency semantics

Keep `acquireRelease`/`scoped` ownership for evaluator children, output streams, native hooks, and exclusive temporary handles. Retain `forkScoped` readers and supervision that notices output failure before a pending child deadline. Preserve partial output draining after timeout and child reaping before completion.

Keep cancellation enabled for supported reads and the narrow atomic write section uninterruptible. Register cleanup only after exclusive acquisition; finalization must not remove another writer's file. The artifact batch has a small fixed compiler-owned set, so its existing unbounded traversal is finite; do not impose a new queue. Worker preflight already uses explicit traversal concurrency. Change concurrency only if evidence shows a workload bound or ownership defect.

### 6. Complete bounded telemetry without adding sinks

Reuse the shared compiler/jobs observers and their existing metric identities. Add missing operation labels to finite unions, instrument meaningful standalone domain operations, and derive applicable workload counts without paths or descriptor values as labels. Preserve laziness, one completion/duration per execution, and distinct nested operation labels.

Test caller-supplied metric registries, tracer/log capture, failure, defect, and interruption, rather than checking only successful counters. Retain suppression while candidate output hooks own stdout/stderr. Runtime edges provision loggers/exporters; compiler modules only emit through the supplied runtime. Do not route compiler logs through candidate capture or insert telemetry into canonical outputs.

### 7. Apply the requested API families deliberately

| Family                                       | Decision in this compiler                                                                                                                                                                 |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Effect, errors, Cause/Exit/Result            | Compose stages; yield expected tagged failures; retain deliberate diagnostic and cleanup supervision.                                                                                     |
| Service, Context, Layer                      | Use explicit native dependencies and effectful implementations; preserve static test layers and compatibility conveniences.                                                               |
| Schema, brands, variants                     | Decode actual untrusted boundaries and reuse contracts; avoid new brands that break existing string interfaces.                                                                           |
| Data                                         | Applicable for private validation decisions when exhaustive states remove assertions; retain published wire discriminators.                                                               |
| Observability, metrics, tracing, logs, Clock | Complete operation signals with bounded labels and monotonic durations.                                                                                                                   |
| Platform Logger                              | Caller/runtime provisioning only; no compiler-owned sink or new logging transport.                                                                                                        |
| Fibers, Scope, acquire/release               | Already required for evaluator, readers, detector hooks, and atomic I/O; preserve lifecycle tests.                                                                                        |
| Concurrency                                  | Structured joins and finite traversals; sequential mutable semantic passes and candidate hook ownership.                                                                                  |
| Stream                                       | Already appropriate for native stdout/stderr byte sources and decoding. Finite AST/index transformations remain ordinary collections.                                                     |
| Ref, Deferred, TestClock                     | Use for shared test observation, readiness, and deterministic deadline/cancellation tests. Invocation-owned sequential maps and native callbacks do not require Ref.                      |
| Cache, memoization, request batching         | Run-local parse/reference indexes have no TTL or concurrent lookup requirement. No new cross-generation cache or resolver; add only if implementation discovers a real matching use case. |
| Queue, PubSub, SubscriptionRef               | No producer-consumer/broadcast/live-state API in this package's watch invalidation utilities. Do not add an event bus.                                                                    |
| Schedule, retry                              | Compiler metadata containing runtime retry policy is data, not a compiler retry loop. No proven retry requirement for mutations or evaluator imports.                                     |
| RcMap                                        | No reference-counted shared keyed resource lifecycle is present.                                                                                                                          |
| Traits                                       | Reuse existing Standard Schema and native capability interfaces; do not introduce a generic trait system without a consumer.                                                              |
| HTTP clients                                 | Compiler performs no outgoing HTTP workflow; evaluator network interception is a native security adapter.                                                                                 |
| Testing                                      | Package-owned `@effect/vitest` tests, deterministic synchronization, real I/O only for native adapter contracts, existing Bun acceptance suite.                                           |

### 8. Use version-matched evidence and checked contracts

Verified installed implementation/examples include `Effect.ts` and `internal/effect.ts` for lazy functions, transforms, Promise adaptation, `acquireRelease`, and `onExit`; `Context.ts`, `Layer.ts`, `Schema.ts`, `ConfigProvider.ts`, `Stream.ts`, `Clock.ts`, and `Metric.ts` for selected public APIs; and `@effect/vitest/src/internal/internal.ts` for test-clock/layer/finalization behavior.

Retained upstream evidence includes `ai-docs/src/40_sql/10_basics.ts` for services/layers/errors/named methods, `src/process/ChildProcessSpawner.ts` and `test/process/ChildProcess.test.ts` for resource ownership, `test/StackCapture.test.ts` for named function tracing, `test/schema/SchemaCompilerConstruction.test.ts` for record construction, `test/schema/SchemaCompilerConcurrency.test.ts` for Deferred-based bounded concurrency, and `test/observability/OtlpMetrics.test.ts` for registry isolation and deterministic telemetry tests. Core module/test absence prevents a full version match; installed source and compiler regressions are the executable compatibility authority. Do not copy older import paths or install in the reference directory.

During implementation, inspect installed implementations/examples for any newly selected Data or Schema helper before using it. Check meaningful exported workflow/service examples with the existing TypeScript in-memory snippet-checking approach and package test configuration. Complete TSDoc parameter/result/generic contracts and document typed failures, services, lifetimes, ordering, and actual thrown exceptions accurately.

Implementation additionally inspected installed `Data.taggedEnum` constructor/matcher examples and its Proxy implementation, `Schema.decodeUnknownEffect` and number field checks, `Logger.make` with `internal/effect.ts`'s `loggerMake`, and `Tracer.make`/`NativeSpan` implementation. Retained OTLP logger/tracer sources provide caller sink usage examples, but the corresponding version-matched core Data/Logger/Tracer tests remain absent from the reference checkout. Configuration decisions stay private; supplied logger/tracer tests and boundary regressions run against installed rc.115 without changing dependencies or the reference checkout.

Installed `Schema.optional` implementation and its embedded example explicitly accept absent keys and `undefined`; retained `packages/effect/test/schema/SchemaCompilerConstruction.test.ts` covers optional-key AST construction but lacks an equivalent version-matched optional-value test. The evaluator regression therefore compares omitted policy fields against explicit `undefined` using installed rc.115.

## Risks / Trade-offs

- Existing overlapping dirty work → reread overlapping files before edits; retain staged/unstaged ownership and leave implementation uncommitted.
- Decoder changes can alter diagnostics, optionality, defaults, or extra-field handling → preserve accumulated issues and add compatibility cases for unknown keys, invalid records, explicit undefined, and empty environment entries.
- Typed errors may change legacy exception identity → adapt only at existing boundaries and assert original values/messages and graph/OpenAPI compatibility mappings.
- New telemetry could contaminate evaluator output or add overhead → retain logging suppression, bounded labels, pure-leaf exemptions, and standalone/composed tests.
- Uninterruptible native publication can delay cancellation → keep the mask confined to the owned atomic operation and verify finalization order with deterministic gates.
- Incomplete upstream evidence → use pinned installed source; disclose remaining reference gaps instead of upgrading or inferring compatibility from retained imports.

## Migration Plan

1. Complete scoped EOF review and pin/source verification using the current working tree.
2. Fix boundary decoding, failure ownership, and explicit parse states with focused regression tests.
3. Complete native service/core composition, then targeted instrumentation and documentation/type organization in the same implementation passes.
4. Run package tests, compiler acceptance, compiler typechecking, formatting, and appropriate boundary/lint/graph/type checks. Confirm canonical outputs and legacy API compatibility.
5. Review final diff and record actual checks and remaining limitations in this change's tasks. No runtime-state migration or artifact version change is needed. Rollback restores only this change's implementation edits while retaining pre-existing user work.

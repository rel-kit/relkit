## Context

See `proposal.md` for motivation and the two delta specs for acceptance behavior. Initial inventory on 2026-10-04 found 18 authored TypeScript files, all read through EOF by the package audits:

| Package                | Complete initial inventory, relative to package root                                                                                                                                                                                                                          |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| drizzle (13)           | `src/activation.ts`, `src/activation.types.ts`, `src/context.ts`, `src/index.ts`, `src/internal.ts`, `src/metadata.ts`, `src/model.ts`, `src/operation-tracing.ts`, `src/operations.ts`, `src/runtime-types.ts`, `src/service.ts`, `src/types.ts`, `tests/activation.test.ts` |
| better-auth (4)        | `src/index.ts`, `src/react.ts`, `src/activation.types.ts`, `service.test.ts`                                                                                                                                                                                                  |
| providers-standard (1) | `src/index.ts`                                                                                                                                                                                                                                                                |

The inventory includes hidden/ignored authored files and excludes `node_modules`, generated `dist`, `.turbo`, binaries, and vendor code. Refresh it at implementation start and completion, including new companions/tests and any `.tsx`, `.mts`, `.cts`, or authored declarations discovered then. No nested package AGENTS files or scoped dirty source changes were found during proposal research.

Drizzle currently uses Promise operations, descriptor-keyed activation, and a SQLite Promise-tail mutex. `BEGIN` is outside its release `finally`; rollback can obscure the callback error. Auth imports `drizzleRuntimeOf`, `DrizzleActivation`, and `DrizzleServiceDescriptor` through `@relkit/drizzle/internal`, caches a shared Promise, and resets failed activation. Its React entrypoint is a separate browser integration. Neither runtime package currently declares Effect directly.

`providers-standard/src/index.ts` is `export {};`. Redis/S3 implementations moved to `integrations/packages/redis` and `integrations/packages/s3`. Remaining references concern release/catalog tooling, root project references, scope scans, boundary exclusions, and history; no current runtime consumer was found. Stale generated files do not establish authored functionality.

## Goals / Non-Goals

Implementation refresh on October 4 confirmed the same 18 authored paths, read
through EOF, with no additional hidden/configuration TypeScript or nested package
instructions. Reviewed dispositions, exclusions, clean framework/demo source
baselines and isolated revision are recorded in [implementation evidence](implementation-evidence.md).

**Goals:** Make cohesive runtime services own dependency acquisition, workflows, typed failures, state and cleanup; preserve authoring/inference and externally visible compatibility; verify standalone diagnostics and actual driver limitations; integrate package work and demo evidence without testing an unrelated checkout.

**Non-Goals:** Replacing Drizzle or Better Auth, changing Zod-facing APIs, adding auth-session caching, creating provider functionality, broad runtime rewrites, provider retirement/unpublishing, cloud deployment, or paid-model certification. This proposal does not claim implementation or E2E results.

## Decisions

### 1. Keep authoring and SDK boundaries stable

Use coherent `Context.Service` contracts and `Layer.effect(..., Effect.gen(...))` live acquisition with `Service.of`, plus deterministic test Layers. Named `Effect.fn` methods own runtime workflows. Required synchronous descriptor/model helpers stay synchronous; Promise CRUD, handlers and SDK calls become thin adapters that execute effects at their established framework edge. Do not create a service per source file or rebuild a Layer on each operation.

Preserve descriptor symbols, frozen public values, lazy compilation, first-activation environment selection, model extension return inference, `base` override promises, dialect detection, selectors/pagination, transaction-bound models, no nested portable transactions, `zodSchemas`, native auth session inference, handler identity, inactive 503, and route-derived base paths. Characterize public error classes/messages before translating internal tagged failures back at compatibility edges.

The alternative of replacing all exports with Effect-returning APIs would break consumers and is rejected. Effect-native internals can be exposed only through intentional, reviewed surfaces; do not widen the browser entrypoint's runtime dependencies.

### 2. Establish resource and sharing semantics before parallel implementation

The integration owner defines the Drizzle/auth activation seam and its owner before workers edit it. A Layer owns each runtime's client, coordination state, and finalizers. Use scoped acquisition/release for owned resources; auth borrows the active database and never closes it. Existing descriptor-shared activation and `isolated: true` remain distinct. Preserve failed-acquisition eviction and shared, idempotent close completion. Current close does not evict the shared activation: tests must prevent silently reopening it or changing that behavior in this refactor.

Evaluate `Ref`/`SynchronizedRef` for explicit state transitions and native Effect memoization for single-flight acquisition. Failure reset and cancellation of an individual waiter must not destroy another caller's shared acquisition. Choose a scoped keyed resource map only if the established contract actually includes caller leases; choose Cache only for real cached values with defined invalidation. RcMap's final-borrower release or cache TTL must not redefine the existing owner lifetime. Required services and credentials cannot be hidden behind default `Context.Reference` values.

Drizzle's transaction coordinator must follow the actual shared client identity, including two descriptors returning the same SQLite client, rather than creating independent locks that permit overlapping transactions. Scope its retention appropriately and characterize this case before replacing the existing WeakMap.

### 3. Make transaction cleanup safe under real driver capabilities

Replace ad hoc Promise-tail coordination with an Effect synchronization primitive after verifying its pinned API. Include begin within the protected operation. Release admission on begin/callback/commit/rollback failure and waiting interruption; retain both primary and cleanup causes without erasing defects or interruption. Keep state-dependent operations sequential and never retry a non-idempotent transaction automatically.

Pass cancellation to drivers that support it. For uncancellable native Promises, do not release a permit, close the client, or start rollback while the original mutation can still run. Use the smallest required protected region or completion handoff, with tests proving actual native completion and safe cleanup order. Synchronous SQLite work is not preemptively interruptible. A superficial `tryPromise` wrapper plus early fiber interruption is insufficient evidence.

### 4. Apply schemas and typed errors at truthful boundaries

Use `.schemas.ts` for executable input/row contracts, schema-derived `.types.ts` for named data contracts, and `Schema.TaggedError` in runtime error modules. Preserve rich opaque driver/auth objects and callbacks without JSON round-tripping. Validate unknown data where the domain has a schema; do not pretend an unchecked cast validates native SDK values.

Installed `drizzle-orm@1.0.0-rc.5-169397b` exports `drizzle-orm/effect-schema`. Its [official guide](https://orm.drizzle.team/docs/effect-schema) and installed generator support select/insert/update contracts. Keep `zodSchemas` compatible and prove defaults, nullability, generated columns, partial updates, overrides, and actual row compatibility before adopting internal Effect schemas. No upgrade is required by this design.

### 5. Instrument operations once, with usable sinks

Extend/reuse the current invocation tracing conventions through one shared operation wrapper per appropriate domain. Each independently callable runtime operation reports success/failure/defect/interruption, duration, relevant work count, and bounded operation/outcome labels. Preserve parent trace context and avoid double-counting Promise adapters. Emit meaningful lifecycle/outcome/recovery/failure logs at appropriate configured levels, not only Debug. Keep SQL values, rows, credentials, tokens, cookies, and headers out of diagnostics.

Provision exporters/loggers at the runtime edge, reusing existing sinks. Test actual sink output and thresholds, standalone calls as well as composition, finalizer behavior, and synthetic-secret redaction. If child fibers exist, apply `References.MinimumLogLevel` locally before forking and test parent/sibling isolation plus annotation inheritance. An operation span alone is not sufficient instrumentation.

### 6. Consider every requested capability without adding artificial features

| Capability families                                    | Selection for this scope                                                                                                                                                                                        |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Service, Schema, Tagged Errors, Error Management, Data | Required domain contracts and validated boundaries; tagged internal states only where they clarify a real state machine.                                                                                        |
| Observability, Metrics, Tracing, Logs, Platform Logger | Shared operation instrumentation and existing application sinks; no unsolicited exporter/file sink.                                                                                                             |
| Scope, AcquireRelease, Refs, Concurrency               | Runtime/client ownership, atomic activation state and safe transaction coordination. Bound independent effectful traversals; preserve sequential and early-exit semantics.                                      |
| RcMap, Cache                                           | Assess against sharing and failure-reset requirements; no TTL/session cache or leased lifetime unless the contract warrants it.                                                                                 |
| Fibers, Queue, PubSub, Stream                          | Own any actual background task or incremental source introduced/discovered. Current code has no worker/event source requiring new queues or streams. Effect traversal already supervises concurrent child work. |
| Clocks, Scheduling, Configs                            | Monotonic duration/deterministic tests; Config only for real runtime configuration acquisition; no invented polling/retry. Respect passed environment and native options contracts.                             |
| Testing, Traits                                        | Substitutable Layers with deterministic synchronization and existing equality/identity rules; do not invent a generic Trait module.                                                                             |

Use pure leaves and suitable Effect Array/Iterable helpers where appropriate; effectful loops use Effect traversal with documented ordering, bounds, failure policy, and laziness. Do not turn trivial predicates or React hooks into effects. Review every changed loop, Promise batch, iterator, and background task.

### 7. Pin API evidence and document complete contracts

Root and installed Effect and `@effect/vitest` are `4.0.0-rc.115`. `repos/effect` is partial: core `Context.ts`, `Layer.ts`, `Effect.ts`, `Schema.ts`, core tests, package version metadata, `.agents/AGENTS.md`, and `LLMS.md` are absent. Available useful vendor evidence includes `ai-docs/src/40_sql/10_basics.ts`, `packages/effect/src/sql/SqlClient.ts`, `packages/effect/test/sql/SqlClient.test.ts`, and `packages/effect/test/Effectable.test.ts`. The audit checked service composition, transaction cleanup, and failed-begin examples/tests there; the vendor revision is not assumed compatible.

Inspect selected APIs in installed `node_modules/effect/src` and available vendor implementation/tests/examples before coding. Where signatures or behavior remain unresolved, use version-matched upstream sources, recording the gap. Never update the vendor checkout or silently change pins. Add direct package Effect dependencies at the existing pin where imports require them, and use the existing pinned test toolchain.

Apply the use-effect TSDoc reference: summaries, every parameter/generic role, lazy success/failure/dependency/lifetime contracts, and checked examples for non-obvious exported composition. Keep types in useful companions, runtime schemas separate, direct owning-leaf imports, intentional type-only re-exports, no empty companion modules, one blank line between declarations, and implementation files at most 250 lines. Preserve augmentation/public inference. Read konsistent guidance before structural edits.

### 8. Parallelize only the independent work

Use one managed implementation worktree from an explicitly inspected source revision after proposal handoff; reuse an appropriate attachment if available. Record any newly dirty source and bring only authorized relevant context into the candidate without resetting or committing user changes. Planning artifacts remain in this checkout and must be accessible to the worker. The user authorized worktree isolation, not an unrelated default-branch baseline.

After the shared seam is agreed, two workers can implement Drizzle and Auth in disjoint package roots within that isolated checkout. The primary agent owns shared manifests/lockfile, runtime consumers, test orchestration, and the small provider audit. Keep at most primary + two implementers + one independent reviewer active. A reviewer must not approve their own edits. There is no fourth package to assign, and a separate provider implementation worktree would add overhead for one empty file.

Integrate and accept Drizzle before Auth and then the provider disposition. If contract churn makes concurrent work slower, serialize dependent changes while continuing independent tests/docs/reviews. Record observed coordination cost rather than promising an unmeasured speedup. Never run concurrent mutations of shared lockfiles, demo links, generated output, state roots, or fixed ports.

Every phase ends with an independent reviewer loading use-effect/Effect guidance and reading every changed TypeScript file through EOF, including tests/configuration, moved/added files, and necessary outside-package support. Compare the phase diff and full resulting files against ownership, contracts, all applicable capability families, documentation, and test evidence. Resolve findings and review the corrected files. Track concise reviewed-path coverage in task evidence, not a new per-symbol reporting system.

### 9. Reproduce existing demo checks against the candidate build

Use `/Users/mustafaelsayed/Workspace/relkit-regression-demo` and the retained `evidence/ai-validation-2026-10-03/agent-starter` fixture. The linked chat `01a0fee1-8e3b-7761-acfb-393c901f5648`, `AI_REPAIR_VALIDATION.md`, and `AI_INDEPENDENT_VALIDATION.md` provide replay context; prior passing results are historical, not candidate evidence.

Before live tests, inspect running processes/ports and actual dependency realpaths. Build the candidate framework/CLI and deliberately prepare demo/fixture links with `RELKIT_ROOT` pointing to that candidate. The demo's `scripts/setup-local.mjs` supports that setting but global Bun links may affect other sessions: serialize link changes, record prior targets and restore them afterward. Prefer isolated local runtime state and unused ports where probes support overrides; hard-coded 3000/3210 checks require exclusive ownership or a narrowly scoped parameterization. Preserve existing servers, user data, and evidence; do not silently test an old running build.

Run demo `check`, `typecheck`, `test`, live smoke, validation regressions, and inspector regressions. Run fixture check/typecheck/test and start its credential-free generated host. Replay these existing scripts with a fresh `RELKIT_AI_EVIDENCE_DIR` per probe and explicit URL settings:

```sh
rtk env RELKIT_ORIGIN_PROBE_URL=http://127.0.0.1:3330 bun scripts/verify-dev-origin.mjs
rtk env RELKIT_AI_VALIDATION_URL=http://127.0.0.1:3330 bun scripts/verify-generated-ai.mjs
rtk env RELKIT_AI_VALIDATION_URL=http://127.0.0.1:3330 bun scripts/verify-realtime-disconnect.mjs
```

Also replay the origin probe on the actual demo endpoint and foreign-origin rejection from the existing regression suite. From candidate RELKIT run:

```sh
rtk env RELKIT_GENERATED_HOST_URL=http://127.0.0.1:3330 bun x playwright test --config=playwright.commerce.config.ts
```

Expected assertions include same-origin success, foreign-origin denial, invalid agent/channel input classification, valid offline tool/persistence/idempotency behavior, HTTP/WebSocket replay/isolation, streaming order, cancellation telemetry, and presence cleanup. Do not hard-code historical test totals as a substitute for discovering the current suite.

The actual demo uses a paid model for its agent, so `verify-demo-agent.mjs`, `verify-demo-luna.mjs`, and `verify-luna-agent.mjs` are separate authorized live-provider probes, not ordinary offline gates. Preserve historical live evidence and label it accordingly. Diagnostic scripts intentionally retain unrelated failures from `VALIDATION.md`; establish a baseline, compare candidate behavior, and keep failures explicit. Docker supports the existing local Redis/MinIO demo; lack of Docker blocks that part of acceptance rather than counting as a pass. Release `build` inside this Docker-only demo is a documented provider-binding limitation, not the local E2E gate.

Existing demo routes alone may not exercise Drizzle/Auth. Retain package/API/type/integration tests and add a focused generated database/auth fixture where needed, proving database write/read/rollback, auth session and protected-route behavior, isolated activation and orderly shutdown against the candidate. Offline AI probes cannot substitute for this coverage.

## Risks / Trade-offs

- **Changed resource lifetime** → Characterize descriptor sharing, first environment, close behavior and shared-client coordination before selecting memoization or RcMap.
- **Premature cancellation cleanup** → Verify driver capabilities and wait for safe native completion before release; test controlled pending calls.
- **Public failure/type drift** → Preserve adapters and run inference, SDK compatibility, schema parity, and generated-project tests.
- **Auth/browser dependency leakage** → Keep server service acquisition out of the React subpath and check the browser export/build.
- **Partial vendor reference** → Disclose missing sources/tests and verify pinned installed behavior; do not treat vendor examples as version authority.
- **False demo acceptance** → Record build identity, dependency realpaths, fresh host startup, endpoints, state roots, and replay evidence.
- **Parallel setup exceeds benefit** → Two package workers at most; shared owner and stable seam first; serialize if conflicts erase savings.
- **Empty package remains confusing** → Document compatibility-only status and absence of runtime consumers; defer coordinated retirement explicitly.

## Migration Plan

1. Establish inventory, baseline tests, API evidence, lifecycle compatibility and the shared seam; independent phase review.
2. Implement/review Drizzle while Auth prepares against the seam; integrate Drizzle first.
3. Complete and independently review Auth including its React boundary; integrate and run combined lifecycle tests.
4. Complete provider purpose documentation and compatibility checks; independent review of any changed TypeScript.
5. Run final repository verification, generated database/auth coverage and candidate-linked demo E2E; independent full-diff review, then reconcile the entire inventory.

Keep implementation uncommitted in the intended worktree. Preserve the original checkout and restore temporary demo links/runtime resources after verification. If a phase cannot preserve compatibility, leave it unaccepted and revise its implementation; do not reset user changes or remove the old API. Demo source/report edits, if necessary, must follow its separate AGENTS publication requirements and be reported separately; do not stage unrelated demo changes. Required unavailable checks remain blockers to claiming full acceptance.

# Effect capabilities and API selection

Consider all **25 requested families** while implementing the scoped domain; adopt every applicable capability through its Services and Layers. This is a selection guide, not a requirement to introduce every module or produce a family/status ledger. Read the relevant sections and reuse verified patterns across files.

## Source authority and navigation

Capabilities below were reviewed against Effect **4.0.0-rc.115** vendor source and relevant tests on 2026-10-01, alongside the [v4 guides](https://effect.website/docs/v4/getting-started). This is a review baseline, not a dependency pin: the project's installed version determines usable imports, signatures, and semantics.

The Service, Tagged Errors, and Error Management guidance was refreshed on
2026-10-08 against the linked v4 guides, installed Effect **4.0.1**, and matching
upstream tests. Fibers, Deferred, Queue, PubSub, Semaphore, Latch and concurrency
selection were also refreshed against Effect 4.0.1 and their matching tests.
Code-style composition (Function.dual, Brand, Match, Do and control-flow APIs)
was also checked against 4.0.1; see [Effect code style](effect-code-style.md).
Other capability entries retain their earlier review baseline.

Every source path is relative to **`<project-root>/repos/effect`**. `S/` means `packages/effect/src/`; `T/` means `packages/effect/test/`. For example, `S/Queue.ts` resolves to `<project-root>/repos/effect/packages/effect/src/Queue.ts`. Treat the vendor as read-only; import runtime APIs from dependencies.

For a selected capability, locate its export and surrounding TSDoc with `rg --no-ignore`, read the implementation/delegates and relevant examples/tests, and verify installed compatibility. Inspect once per pattern; repeat only for a different pattern or unresolved behavior. Use `rg --files --no-ignore` to resolve paths in another revision. If source/tests are absent or mismatched, disclose that and follow the main skill's installed-source, then version-matched-upstream fallback. Do not invent test paths or transfer v3 names/signatures into v4.

Choose sections by responsibility:

- Architecture/contracts: [Service](#1-service), [Schema](#2-schema), [Tagged Errors](#3-tagged-errors), [Error Management](#4-error-management), [Data](#5-data).
- Diagnostics: [Observability](#6-observability), [Metrics](#7-metrics), [Tracing](#8-tracing), [Logs](#9-logs), [Platform Logger](#25-platform-logger).
- Work distribution: [Fibers](#10-fibers), [PubSub](#11-pubsub), [Queue](#12-queue), [Stream](#13-stream), [Concurrency](#15-concurrency).
- Time/lifetimes: [Clocks](#14-clocks), [Caching](#16-caching), [Scheduling](#17-scheduling), [Scope](#18-scope), [RcMap](#19-rcmap), [AcquireRelease](#20-acquirerelease).
- State/configuration/verification: [Testing](#21-testing), [Traits](#22-traits), [Refs](#23-refs), [Configs](#24-configs).
- Supporting operations: [collections and value types](#supporting-collections-and-value-types), [workflow and adapter APIs](#supporting-workflow-and-adapter-apis).

Before selecting capabilities, establish applicable behavioral guarantees with
[contracts and testing](contracts-and-testing.md). For registration context,
worker outcome policies, and persisted recovery, read the relevant sections of
[lifecycle and durability](lifecycle-and-durability.md). These recipes refine the
existing API guidance without requiring new infrastructure or an API ledger.

## 1. Service

Read [services and Context](services-and-context.md) for acquisition versus
per-call requirements, defaults, composition, memoization, and a checked example.

- **Capabilities:** `Context.Service` identifies a typed dependency; yielding its key accesses the implementation. `Service.of` checks the implementation type. `Context.Reference` supplies an ambient default, suitable for safe runtime settings rather than required persistence, credentials, or authority.
- **Construction:** Concrete services own a `make` implementation; compose it with
  `Layer.effect(Service, Service.make)` (or `Service.make(inputs)`), as specified
  in the service reference. Contract-only request/dependency keys do not need a
  fabricated implementation.
- **Layers:** `Layer.effect` acquires dependencies/resources in the layer scope; `succeed` supplies an existing value; `sync` constructs lazily; `effectContext` supplies several services; `effectDiscard` owns startup work; `unwrap` chooses a layer effectfully. `provide` hides implementation dependencies, `provideMerge` also exposes them, and `mergeAll` builds independent layers concurrently.
- **Apply/check:** Group coherent module capabilities behind one domain contract with live/test Layers. Reuse named layer values for acquisition sharing within the owning build/runtime; `fresh` intentionally prevents sharing. `ManagedRuntime.make` supports repeated framework calls with lazy, cached acquisition; dispose it at shutdown. `Layer.launch` holds an application layer open until interruption. Service tags do not automatically add logs/metrics or supervise worker failures: instrument methods and own workers explicitly; acquisition must return.
- **Vendor:** `S/Context.ts`, `S/Layer.ts`, `S/ManagedRuntime.ts`; `T/Context.test.ts`, `T/Layer.test.ts`, `T/ManagedRuntime.test.ts`. Search `Service`, `effect`, `provide`, `memo`, `finalizers`, `dispose`. Recipes: Effect skill `references/SERVICES_LAYERS.md`; [services](https://effect.website/docs/v4/requirements-management/services), [layers](https://effect.website/docs/v4/requirements-management/layers).
- **Boundary check:** Keep consumer requirements distinct from executor-provided run context and hidden adapter dependencies. When callbacks execute later, capture only valid dependencies and verify override precedence; runtime Scope/span/identity belongs to the executing owner. Test meaningful dependency exclusions and isolation when composition changes.

## 2. Schema

- **Capabilities:** `Struct`, `Array`, `Record`, `Union`, `TaggedStruct` and `TaggedUnion` model validated shapes; tagged unions offer cases, guards and exhaustive matching. `check` attaches constraints; `brand` adds nominal identity but does not itself validate. `optionalKey` permits omission without automatically permitting an explicit `undefined`; inspect `optional` when that distinction matters.
- **Apply/check:** Define runtime contracts in `.schemas.ts`, derive their types in `.types.ts`, and decode unknown input with `decodeUnknownEffect`. `encodeEffect` handles typed outgoing values. A schema instance's `makeEffect` constructs through the typed error channel; throwing `make` is for trusted construction. `Schema` decoding fails with `SchemaError`, while lower-level `SchemaParser` and instance construction expose `SchemaIssue.Issue`: translate the actual error type. Track decoded/encoded types and required services independently.
- **Transform/derive:** `decodeTo` connects representations using `SchemaGetter`/`SchemaTransformation`; inspect both directions before defining custom conversions. Schema also derives JSON Schema documents, codecs, equivalence and other utilities; use those when a consumer needs them, rather than duplicating a contract. Test unknown input, exact optional keys, constraints and encode/decode behavior.
- **Storage check:** Test the actual encoded transport/driver round trip, including rich values and missing versus null fields. Declare whether secret fields may be encoded/persisted: Redacted inspection does not establish storage secrecy. Reject prohibited encoding before persistence and keep failure diagnostics redacted; verify codec options against the pin.
- **Vendor:** `S/Schema.ts`, `S/SchemaParser.ts`, `S/SchemaIssue.ts`, `S/SchemaGetter.ts`, `S/SchemaTransformation.ts`; `T/schema/Schema.test.ts`, `T/schema/SchemaParser.test.ts`, `T/schema/SchemaGetter.test.ts`, `T/schema/SchemaTransformation.test.ts`. Search the chosen schema/check/decoder and `makeEffect`. Recipes: `references/SCHEMA.md`; [basic usage](https://effect.website/docs/v4/schema/basic-usage).

## 3. Tagged Errors

- **Capabilities:** `Schema.TaggedError` defines a schema-backed, yieldable error class with a discriminant and typed payload. `Data.TaggedError` provides an internal tagged error without a validation/serialization schema.
- **Apply/check:** Default new in-process domain/adapter failures to `Data.TaggedError`; choose `Schema.TaggedError` when the error needs a validation/codec contract. Preserve compatible existing public errors. Use unique stable tags and safe operation context, translate foreign failures once at the owning adapter, and recover selectively. Keep classes in runtime modules. Verify construction, E-channel discrimination and recovery, plus codec behavior when applicable. See [errors and recovery](errors-and-recovery.md); this rule overrides the underlying Effect skill's blanket Schema default.
- **Vendor:** `S/Schema.ts` (`TaggedError`), `S/Data.ts` (`TaggedError`), `S/Effect.ts` (`catchTag`); `T/schema/Schema.test.ts` (`describe("TaggedError")`), `T/Data.test.ts`, `T/Effect.test.ts`.

## 4. Error Management

Read [errors and recovery](errors-and-recovery.md) for boundary classification,
fallback/matching, bounded retries, timeout placement, and multiple failures.

- **Capabilities:** `Effect.mapError` translates typed failures; `catchTag`/`catchTags` recover selected variants. `Effect.result` returns typed success/failure as `Result` while defects and interruption still propagate. `Effect.exit` captures the complete outcome, including its `Cause`.
- **Apply/check:** Use typed recovery by default; cause-level handling is for supervision and explicit defect/interruption policies. v4 `Cause` contains `Fail`, `Die` and `Interrupt` reasons; `combine`, `findError`, `findDefect` and `hasInterruptsOnly` inspect/combine them. Preserve mixed causes: the presence of interruption alone does not mean no other failure occurred. `Exit.match` inspects a completed computation. Keep exhausted failures visible, retries idempotent and timeouts bounded. Verify failure, defect, interruption and mixed outcomes without silently converting them to success.
- **Vendor:** `S/Effect.ts`, `S/Cause.ts`, `S/Exit.ts`, `S/Result.ts`; `T/Effect.test.ts`, `T/Cause.test.ts`, `T/Exit.test.ts`, `T/Result.test.ts`. Search `result`, `exit`, `catchTag`, `reasons`, `hasInterruptsOnly`.

## 5. Data

- **Capabilities:** `Data.TaggedEnum` describes a closed internal union; `taggedEnum` creates constructors, guards and `$match`. `Class`/`TaggedClass` provide readonly data shapes; `Error`/`TaggedError` provide yieldable internal errors.
- **Apply/check:** Use tagged data for workflow decisions and state transitions, with exhaustive matching. Use Schema where validation or encoding is needed. Treat values as immutable; readonly types do not imply deep runtime freezing. Do not assume older Data structural helpers exist. Check construction/matching and equality requirements separately.
- **Vendor:** `S/Data.ts`; `T/Data.test.ts`. Search `TaggedEnum`, `taggedEnum`, `$match`, `yield`.

## 6. Observability

- **Capabilities:** Combine operation spans, structured logs and updated metrics with an actual sink/exporter. Core `unstable/observability/Otlp` offers combined `layerJson`/`layerProtobuf`; `OtlpLogger`, `OtlpTracer` and `OtlpMetrics` configure individual signals. These layers require an HTTP client; raw `Otlp.layer` additionally requires serialization. `PrometheusMetrics.format` renders a snapshot; `layerHttp` exposes a scrape endpoint.
- **Apply/check:** Install shared diagnostics once at the runtime edge; instrument service methods so standalone calls remain observable. Reuse existing exporters. Where an application already uses OpenTelemetry SDK providers/readers/processors, inspect the `@effect/opentelemetry` bridge rather than adding a second exporting stack. Verify correlation, resource/service identity, units, delivery, batching and scoped shutdown/flush; span names or stored telemetry records alone are insufficient.
- **Vendor:** `S/unstable/observability/Otlp.ts`, `OtlpExporter.ts`, `OtlpLogger.ts`, `OtlpTracer.ts`, `OtlpMetrics.ts`, `PrometheusMetrics.ts` in that directory; `T/unstable/observability/OtlpExporter.test.ts`, `OtlpMetrics.test.ts`, `PrometheusMetrics.test.ts` in that test directory. SDK bridge: `packages/opentelemetry/src/Otel{Logger,Tracer,Metrics}.ts` and corresponding `packages/opentelemetry/test/Otel*.test.ts`. Verify unstable exports for the pinned version.

## 7. Metrics

- **Capabilities:** `counter` tracks totals (`incremental: true` prevents decrements); `gauge` tracks a current value; `histogram` records a distribution using explicit boundaries; `frequency` counts strings; `summary` computes retained-window quantiles. `update` adds to counters but replaces gauges; `modify` adds to gauges. `withAttributes` creates dimensions; `value`/`snapshot` read the active registry. `enableRuntimeMetrics` adds fiber lifecycle measurements.
- **Apply/check:** Measure operation outcomes, duration, processed work and saturation at truthful boundaries. Keep operation/outcome labels finite; run/user IDs belong in traces/logs. Choose units/buckets deliberately, balance active gauges in finalizers, and verify updates as well as export. Isolate the registry in tests; runtime fiber metrics complement domain metrics.
- **Meaning:** Distinguish process-local attempts from accepted transitions and durable counts. Define how retries/redelivery contribute, preserve unit conventions, and consider query cost for sampled metrics. Durable records complement operational instrumentation; neither proves the other's delivery.
- **Vendor:** `S/Metric.ts`; `T/Metric.test.ts` (`active registry`, `equal attributes`, `incremental`), `T/unstable/observability/OtlpMetrics.test.ts`. [Metrics guide](https://effect.website/docs/v4/observability/metrics).

## 8. Tracing

- **Capabilities:** Named `Effect.fn("Domain.operation")` creates a span when executed; unnamed `Effect.fn(body)` creates a stack-frame boundary without a named span. `withSpan` defines a scoped child span; `annotateSpans` enriches spans; `withParentSpan` integrates an existing/external parent. `Tracer` models spans, links, status and propagation.
- **Apply/check:** Trace independent domain/service operations with bounded names and useful attributes. Keep parenting/correlation across child fibers and adapters, avoid duplicate wrapper spans and redact sensitive attributes. Verify success/failure/interruption completion and the installed exporter; native span creation does not prove export.
- **Delayed boundaries:** For persisted/cross-process work, choose producer parenting versus a new trace with a causal link according to delay, sampling, and propagation policy. Test the relationship and supply the current execution span; avoid restoring stale registration tracing context.
- **Vendor:** `S/Effect.ts` (`fn`, `withSpan`, `annotateSpans`), `S/Tracer.ts`; `T/Effect.test.ts`, `T/Tracer.test.ts`, `packages/opentelemetry/test/OtelTracer.test.ts`. [Tracing guide](https://effect.website/docs/v4/observability/tracing).

## 9. Logs

- **Capabilities:** `Effect.logInfo`/`logDebug`/`logWarning`/`logError` set event severity; `annotateLogs` supplies structured context. `Logger.make` defines a sink/formatter; `formatJson`/`formatLogFmt` format events. `Logger.layer` replaces active loggers unless `mergeWithExisting` is requested. `References.MinimumLogLevel` filters events; `CurrentLogLevel` changes the default severity of `Effect.log`, not the filter.
- **Apply/check:** Emit lifecycle/outcomes at appropriate visible levels, recovery at Warn and unrecovered failures at their owning boundary. Distinguish interruption and avoid duplicate reports. Child fibers inherit context; provide level overrides locally around their workflow before forking, keeping parent/sibling settings intact. Test actual sink output, configured thresholds, annotations and redaction; debug-only completion, especially for failures, is insufficient.
- **Vendor:** `S/Effect.ts`, `S/Logger.ts`, `S/References.ts`; `T/Logger.test.ts`, logging cases in `T/Effect.test.ts`, `packages/opentelemetry/test/OtelLogger.test.ts`. [Logging guide](https://effect.website/docs/v4/observability/logging).

## 10. Fibers

Read [concurrency and coordination](concurrency-and-coordination.md) for the
choice of primitive, ownership and deterministic acceptance across sections 10–15.

- **Capabilities:** `Effect.forkChild` ties work to the parent fiber; `forkScoped` ties it to the current Scope; `forkIn` chooses an explicit owner. `Fiber.join` propagates a result/failure; `Fiber.await` returns an `Exit`; `interrupt` waits for cleanup. `FiberSet` owns a changing set of tasks; `FiberMap` owns keyed tasks and can interrupt a previous task on replacement.
- **Apply/check:** Use explicit fibers for background workers/listeners and separately supervised lifetimes. Concurrent traversal already manages child fibers. Layer acquisition must finish after starting scoped workers. `FiberSet`/`FiberMap.join` supervise failure/closure; use `awaitEmpty` for normal draining, not `join` as an all-success barrier. Observe failure deliberately; interruption is cooperative and cannot cancel an external API that ignores its signal. Test ownership, replacement, failure supervision, draining and finalization.
- **Worker check:** Define user cancellation, owner shutdown, self-interruption, timeout, and lost ownership separately where they change settlement or accounting. A shared supervisor must not block on one task's slow finalizers; cancellation delivery and owner-observed cleanup both need explicit lifetimes. See [lifecycle and durability](lifecycle-and-durability.md).
- **Vendor:** `S/Effect.ts`, `S/Fiber.ts`, `S/FiberSet.ts`, `S/FiberMap.ts`; `T/Fiber.test.ts`, `T/FiberSet.test.ts`, `T/FiberMap.test.ts`, fork cases in `T/Effect.test.ts`.

## 11. PubSub

- **Capabilities:** Broadcast delivery follows the chosen overflow/replay policy for active subscribers. `bounded` backpressures slow consumers; `dropping` rejects new overflow; `sliding` discards older overflow; `unbounded` grows without a limit. Optional replay retains recent values for late subscribers. `subscribe` requires Scope; `Stream.fromPubSub` owns subscription consumption.
- **Apply/check:** Use for broadcast events; choose capacity, overflow and replay deliberately. Own hub shutdown and subscriber scopes. Publication acceptance does not mean durable delivery or consumer processing. Test slow/late subscribers, overflow, ordering and shutdown; choose Queue when consumers should compete for each item, or SubscriptionRef for observable state.
- **Vendor:** `S/PubSub.ts`, `S/Stream.ts`; `T/PubSub.test.ts`, `T/Stream.test.ts`. Search `replay`, `backpressured`, `subscribe`, `shutdown`.

## 12. Queue

- **Capabilities:** `Queue<A, E>` hands each offered item to one consumer. `bounded` uses backpressure; `make({ capacity, strategy })` selects suspend/drop/slide behavior. `offer` reports acceptance; `take` suspends until a value or termination. `end` marks normal completion using `Cause.Done`; `fail` supplies typed failure. Graceful completion allows buffered draining; `shutdown` discards buffered items immediately; open queues interrupt while already-closing queues retain their terminal cause. `Stream.fromQueue` interprets Done as stream end.
- **Apply/check:** Model work distribution, with explicit capacity and a graceful-drain versus immediate-stop policy. Own producer/consumer fibers and queue finalization. Choose whether terminal failures should drain or stop processing. Test blocked producers, acceptance, competing consumers, cancellation, buffered draining and terminal errors; do not reuse v3 queue termination assumptions.
- **Vendor:** `S/Queue.ts`, `S/Stream.ts`, `S/Cause.ts` (`Done`); `T/Queue.test.ts` (`interrupt allows draining`, `shutdown`, `offerAll can be interrupted`), `T/Stream.test.ts`. [Queue guide](https://effect.website/docs/v4/concurrency/queue).

## 13. Stream

- **Capabilities:** Sources include `fromIterable`, `fromEffect`, `fromAsyncIterable`, queues/pubsubs, pagination and `callback`. `mapEffect` transforms effectfully with bounded concurrency; `flatMap` combines inner streams, merging concurrent outputs as they arrive. `buffer` chooses capacity/overflow; `groupedWithin` batches by size/time. `scoped` owns resources; `runForEach`/`runDrain` consume effects and `runCollect` collects finite output.
- **Apply/check:** Use incremental sources that need backpressure/cancellation; configure callback buffers rather than accepting unbounded defaults blindly. Preserve required order, consumption and resource lifetime. Retrying a stream restarts its acquisition and can replay values: verify idempotency/deduplication. For result-producing consumers, `Stream.run` with `Sink.fold`, `take`, `collect` or `forEach` supports reduction, early termination and leftovers. Never collect infinite sources. Test early exit, backpressure, errors, replay and release.
- **Vendor:** `S/Stream.ts`, `S/Sink.ts`, delegated `S/Channel.ts`; `T/Stream.test.ts`, `T/Sink.test.ts`. Search selected source, `mapEffect`, `flatMap`, `retry`, `leftovers`, `toAsyncIterable`.

## 14. Clocks

- **Capabilities:** `Clock.currentTimeMillis`/`currentTimeNanos` are Unix wall time; `monotonicTimeNanos` measures elapsed duration. `Effect.sleep` uses the active Clock. `Duration` expresses delays, TTLs and timeouts. `DateTime.now` uses Clock; DateTime handles UTC/zoned instants, calendar arithmetic and formatting.
- **Apply/check:** Use monotonic differences for latency and wall time for persisted timestamps. Clock nanoseconds are not automatically monotonic. Explicitly choose timezones for calendar rules; use injected time for deadlines and deterministic tests. Verify unit conversion and clock changes; use TestClock for timeout, retry, cache and scheduled-work tests.
- **Vendor:** `S/Clock.ts`, `S/Duration.ts`, `S/DateTime.ts`, `S/testing/TestClock.ts`; `T/Clock.test.ts`, `T/Duration.test.ts`, `T/DateTime.test.ts`, `T/TestClock.test.ts`. Search `monotonic`, `wall`, `adjust`, DST cases.

## 15. Concurrency

Use the [decision table and primitive guidance](concurrency-and-coordination.md)
for Deferred, Semaphore and Latch; they are not interchangeable signaling tools.

- **Capabilities:** `Effect.forEach` traverses effectful items with ordered results, sequential execution by default and bounded concurrency; `discard` avoids result allocation. `all` preserves tuple/record shape and defaults to fail-fast sibling interruption. `all(effects, { mode: "result" })` collects typed outcomes; `validate` accumulates typed failures; `partition` retains failures and successes. `filter` supports effectful predicates.
- **Coordinate/check:** Use `Semaphore.withPermits` for a shared limit, `Deferred` for one-time results/readiness, and `Latch` for a reusable gate. Keep state-dependent work sequential; concurrent starts can occur before a failure, and finalizers must release permits. Preserve early exit and iterator consumption; concurrency is not CPU-thread parallelism. Verify bounds, ordering, failure policy, sibling cleanup and cancellation without sleeps. Defects/interruption still require their own policy, even when typed failures are collected.
- **Vendor:** `S/Effect.ts`, `S/Semaphore.ts`, `S/Deferred.ts`, `S/Latch.ts`; `T/Effect.test.ts` (`forEach`, `all`, `validate`, `partition`), `T/Semaphore.test.ts`, `T/Deferred.test.ts`, `T/Latch.test.ts`.

## 16. Caching

- **Capabilities:** `Cache.make({ lookup, capacity, timeToLive })` uses a duration TTL; concurrent misses share lookup work. `Cache.makeWith(lookup, { capacity, timeToLive: (exit, key) => duration })` chooses TTL by Exit/key, including failed lookups. `get` loads/awaits, `getSuccess` only inspects a resolved success, `refresh` reloads and `invalidate` removes. `Effect.cached`/TTL variants memoize a single effect. `ScopedCache` owns a scope per cached entry and releases it on removal or owner shutdown; inspect its options-object constructor rather than copying Cache's call shape.
- **Apply/check:** Construct shared caches in Layers; choose key equality, negative-cache TTL, invalidation and bounds. Verify the pinned `requireServicesAt` option: lookup requirements may be captured at construction or supplied per call. ScopedCache resources live by entry policy, not caller leases; use RcMap when borrowers must retain a resource during use. Test concurrent misses, expired failures, refresh/invalidation and resource release.
- **Vendor:** `S/Cache.ts`, `S/ScopedCache.ts`, cached APIs in `S/Effect.ts`; `T/Cache.test.ts`, `T/ScopedCache.test.ts`, cached cases in `T/Effect.test.ts`. Recipes: `references/CACHING.md`; [Cache guide](https://effect.website/docs/v4/caching/cache).

## 17. Scheduling

- **Capabilities:** `Schedule.spaced` delays after completion; `fixed` targets cadence without replaying missed ticks; `exponential`/`jittered` provide backoff. `recurs(n)` permits n recurrences after the initial effect. v4 `max([...])` continues while all policies recur using the longest delay; `min([...])` continues while any recur using the shortest. `upTo` bounds time/outputs; `cron` supplies calendar recurrence.
- **Apply/check:** Drive `Effect.retry`/`repeat` and scoped workers with schedules. Retry only suitable idempotent failures, with bounded attempts and total operation deadlines; schedule duration bounds are not a timeout on each running attempt. Handle a worker pass's typed failure before repeating when continued polling is intended. `Cron.parse` returns Result; choose explicit timezone and verify DST/cadence, counts and exhaustion using TestClock. Do not assume v3 combiner names.
- **Vendor:** `S/Schedule.ts`, `S/Cron.ts`, retry/repeat APIs in `S/Effect.ts`; `T/Schedule.test.ts`, `T/Cron.test.ts`, `T/Effect.test.ts`. Recipes: `references/SCHEDULING.md`; [schedules](https://effect.website/docs/v4/scheduling/using-schedules).

## 18. Scope

- **Capabilities:** `Effect.scoped` supplies/closes a scope; Layers own acquisition scopes. Low-level `Scope.make`, `fork`, `provide`, `addFinalizer`, `addFinalizerExit` and `close` support explicit lifetime boundaries and configured finalizer strategy. Closing a parent closes children; exit-aware finalizers receive the closing Exit.
- **Apply/check:** Prefer Layer/scoped ownership; manage low-level scopes only when integrating a lifecycle. Providing a Scope does not close it automatically. Keep handles within their owner lifetime; do not return resources acquired in an already-closed scope. Check partial acquisition, success/failure/interruption release, finalizer ordering and manual-owner shutdown.
- **Vendor:** `S/Scope.ts`, `S/Effect.ts`, `S/Layer.ts`; `T/Scope.test.ts`, `T/Layer.test.ts`, scoped/finalizer cases in `T/Effect.test.ts`.

## 19. RcMap

- **Capabilities:** `RcMap.make` owns shared keyed resources; `get` acquires a caller-scoped lease. The final borrower leaving releases the resource, optionally after `idleTimeToLive`. `touch` extends idle retention; `invalidate` removes a mapping without prematurely releasing an actively borrowed resource. Configured capacity introduces `Cause.ExceededCapacityError`.
- **Apply/check:** Use for keyed sessions/clients/connections whose resources must stay alive during each borrow. Own the map in a Layer and the borrow in the caller's Scope. Define capacity/idle behavior, key equality and invalidation; distinguish these leases from cached values or ScopedCache entry lifetimes. Test sharing, held leases, idle eviction, replacement, capacity failure and final release.
- **Vendor:** `S/RcMap.ts`, `S/Scope.ts`; `T/RcMap.test.ts` (`retains a ready entry`, `capacity`, `idle`, `invalidate`).

## 20. AcquireRelease

- **Capabilities:** `Effect.acquireRelease` registers release in the current Scope after successful acquisition; release sees the closing Exit. Acquisition is protected from interruption by default; the reviewed v4 API offers an interruptible acquisition option. `acquireUseRelease` brackets one complete use; `addFinalizer` attaches lower-level cleanup.
- **Apply/check:** Pair handles/listeners/workers/sinks with cleanup in their owning lifetime. Clean up partially acquired resources inside the acquisition path when acquisition can fail before registration. Keep masking small, pass cancellation to capable SDKs and preserve use/cleanup causes deliberately. Test exactly-once release on success, failure and interruption, including failed/partial acquisition. Closing an inner scope before returning a handle is incorrect.
- **Vendor:** `S/Effect.ts`, `S/Scope.ts`; `T/Effect.test.ts` (`acquireRelease`, `acquireUseRelease`, `finalizer`), `T/Layer.test.ts`, `T/RcMap.test.ts`.

## 21. Testing

- **Capabilities:** Import Effect-aware `it` from **`@effect/vitest`**, normally `it.effect`. The integration owns test scopes and installs controlled services; `it.live` intentionally uses live services/time. `layer` shares a provided Layer across tests, with isolation/concurrency options to inspect. `TestClock.adjust` drives scheduled time; Deferred/Queue/Latch establish readiness. `TestConsole` captures Effect Console output; `Logger.make` captures structured events for exact level/context assertions.
- **Apply/check:** Test the same service contract with deterministic fake dependencies and test Layers, including standalone instrumentation, outcomes, cancellation and scoped workers. Synchronize a sleeper/worker before advancing time. Shared layers may share mutable state: isolate where needed. Keep application tests, fixtures and test Layers under `packages/<package>/tests/<domain>/`, `apps/<app>/tests/<domain>/`, or the other owner's root `tests/`; vendor `test/` names are only source references.
- **Substitutability:** Reuse relevant behavioral tests across implementations with fresh fixtures; matching service types alone cannot establish semantics. Verify affected storage/time/concurrency guarantees at the real boundary, retain explicit capability differences, and report skipped coverage. See [the contract suite example](contracts-and-testing.md#test-the-same-guarantees-across-implementations).
- **Vendor:** `packages/vitest/src/index.ts`, `packages/vitest/src/internal/internal.ts`; `packages/vitest/test/index.test.ts`, `isolation.test.ts`, `layer-concurrency.test.ts` in that test directory; `S/testing/TestClock.ts`, `S/testing/TestConsole.ts`, `T/TestClock.test.ts`, `T/Logger.test.ts`. Recipes: `references/TESTING.md`; [TestClock](https://effect.website/docs/v4/testing/testclock).

## 22. Traits

- **Capabilities:** `Equal` and `Hash` define equality/hash protocols; their default helpers support structural values. `Pipeable` implements `.pipe(...)`; `Order` defines ordering and `Equivalence` a purpose-specific comparison. Structural service interfaces describe substitutable capabilities. There is no generic `Trait` module to import.
- **Apply/check:** Use existing protocols/instances when equality, keys, sorting or fluent APIs require them. Equal values must hash equally; treat hashed objects as immutable because hash caching can make mutation stale. Hash values are not cryptographic identifiers. Verify reflexivity/symmetry/transitivity and equality/hash consistency rather than adding custom protocols gratuitously.
- **Vendor:** `S/Equal.ts`, `S/Hash.ts`, `S/Pipeable.ts`, `S/Order.ts`, `S/Equivalence.ts`; `T/Equal.test.ts`, `T/HashMap.test.ts`, `T/HashSet.test.ts`, `T/Order.test.ts`, `T/Equivalence.test.ts`. Search protocol usages where no dedicated module test exists.

## 23. Refs

- **Capabilities:** `Ref.modify` computes `[result, nextState]` atomically; pure `update` transitions avoid read-then-write races. `SynchronizedRef.modifyEffect`/`updateEffect` serialize effectful transitions, committing only on success. `SubscriptionRef` combines serialized state updates with a stream containing current state and subsequent changes.
- **Apply/check:** Allocate state per Service/Layer lifetime. Choose Ref for pure transitions, SynchronizedRef for effectful serialized work and SubscriptionRef for state observation. Keep critical sections short and preserve state on failure/interruption. A sequence of individually safe get/set operations is not one transaction. Test concurrent changes, failed transitions and scoped subscriptions.
- **Vendor:** `S/Ref.ts`, `S/SynchronizedRef.ts`, `S/SubscriptionRef.ts`; `T/Ref.test.ts`, `T/SynchronizedRef.test.ts`, `T/SubscriptionRef.test.ts`.

## 24. Configs

- **Capabilities:** v4 constructors include `Config.String`, `Int`, `Boolean`, `Duration`, `LogLevel` and `Redacted`; `Config.schema` reads schema-backed settings; `all` groups them. `withDefault`/`option` handle absence, not malformed/partially supplied input. `Config.orElse` can recover ConfigErrors more broadly. `ConfigProvider.fromEnv`/`fromUnknown` supply input; `layer` installs a provider, and provider `orElse` falls back on missing paths without swallowing source errors.
- **Apply/check:** Yield config during Layer acquisition; inject providers in tests. Use structured schemas for related settings, explicit defaults and redacted secrets. Reveal Redacted values only at the required adapter boundary; wrapping is not encryption. Distinguish absent groups, invalid values and provider failures; verify environment naming/empty-string behavior against the pin, not old lowercase constructor examples.
- **Vendor:** `S/Config.ts`, `S/ConfigProvider.ts`, `S/Redacted.ts`; `T/Config.test.ts`, `T/ConfigProvider.test.ts`, `T/Redacted.test.ts`. Recipes: `references/CONFIG.md`; [configuration](https://effect.website/docs/v4/configuration).

## 25. Platform Logger

- **Capabilities:** `Logger.toFile` turns a string formatter into a scoped, batched file sink requiring `FileSystem` and Scope, and flushes on scope closure. `Logger.layer` installs it; platform filesystem Layers implement the host boundary. Console, file and OTLP sinks can be composed according to deployment needs. PlatformLogger is a documentation topic, not a module name to assume.
- **Apply/check:** Install sinks once at startup, selecting Node/Bun/browser-compatible wiring. Own file handles and exporter batching; preserve intended console/trace logging when replacing loggers. Test actual output and flushing with an appropriate filesystem stub or focused temporary-file test under root `tests/`; handle write/flush failures deliberately. Do not add a file sink when the platform or application requires another destination.
- **Vendor:** `S/Logger.ts` (`toFile`, `batched`, `layer`), `S/FileSystem.ts`; `packages/platform/node/src/NodeFileSystem.ts`, `packages/platform/bun/src/BunFileSystem.ts`. Tests/examples: `T/Logger.test.ts`, sink TSDoc and platform filesystem usages; discover relevant platform tests rather than assuming a dedicated logger test. [PlatformLogger guide](https://effect.website/docs/v4/platform/platformlogger).

## Supporting collections and value types

Choose by evaluation/lifetime, not by the presence of a loop:

| Module | Capabilities and selection | Vendor source / tests |
| --- | --- | --- |
| `Array` | Eager transformations, filtering, grouping, deduplication, sorting and non-empty array types. Pure collection logic fits here. Reviewed v4 `filterMap` and `partition` take Result-producing filters; do not copy Option/bare-boolean callback assumptions. | `S/Array.ts`; `T/Array.test.ts` (`filterMap`, `partition`, `groupBy`) |
| `Iterable` | Lazy `map`/`filter`/`take`, search and folds over generators/sets/iterables without eager materialization. Its Result-based `filterMap` differs from a predicate; verify short-circuiting, single-use iterators and consumption. | `S/Iterable.ts`; `T/Iterable.test.ts` (`filterMapWhile`, `findFirst`, `flatten`) |
| `Chunk` | Immutable ordered values with efficient append/prepend/concatenation. Use when persistent sequence updates help; v4 Stream collection returns arrays, so do not assume Chunk output. | `S/Chunk.ts`; `T/Chunk.test.ts` |
| `HashMap`, `HashSet` | Persistent keyed collections and set operations using Equal/Hash; appropriate for value-based keys and immutable state. Preserve equality semantics when replacing native Map/Set. | `S/HashMap.ts`, `S/HashSet.ts`; `T/HashMap.test.ts`, `T/HashSet.test.ts` |
| `Option`, `Result`, `Match` | Model absence and already-computed success/failure; map/match as pure data. Match supports ordered predicates/shapes/tags and exhaustive completion. Use Effect for effectful work; use Result in v4 outcome/filter APIs where specified. | `S/Option.ts`, `S/Result.ts`, `S/Match.ts`; `T/Option.test.ts`, `T/Result.test.ts`, `T/Match.test.ts` |
| `Request`, `RequestResolver` | Typed logical requests, resolver grouping/batching, completion and optional request caches. Useful when an actual backend batch endpoint exists; bounded traversal is sufficient for ordinary independent calls. Resolve every request and preserve failure/cancellation. | `S/Request.ts`, `S/RequestResolver.ts`, `S/Effect.ts` (`request`); `T/Request.test.ts` and resolver usages |

Keep trivial predicates and required native callbacks direct. Use Effect traversal for finite effectful collections and Stream for incremental/backpressured sources. Preserve behavior when changing eagerness, ordering, failure accumulation or key equality.

## Supporting workflow and adapter APIs

`Effect.gen` composes service workflows; named `Effect.fn` defines operations. `sync` suspends synchronous work but does not translate thrown exceptions into domain failures; use the pinned `Effect.try` when that translation is intended. `tryPromise({ try, catch })` suspends SDK calls and maps rejection into a typed error; pass its AbortSignal to capable SDKs. `callback` adapts one-shot callbacks and can return interruption cleanup; use Stream callbacks for repeated emissions. Run effects through Effect/ManagedRuntime only at application/framework boundaries.

For shared instrumentation, inspect `onExit` plus monotonic Clock readings to observe every outcome; `timed` alone pairs duration only with successful values. Instrumentation must preserve the original result/cause deliberately; cleanup failure can combine with workflow failure. Share wrappers without making instrumentation recursively instrument itself.

**Vendor:** `S/Effect.ts`, `S/ManagedRuntime.ts`, `S/Clock.ts`, internal delegates; `T/Effect.test.ts` (constructors, `tryPromise`, `callback`, `onExit`, `timed`), `T/ManagedRuntime.test.ts`, `T/Clock.test.ts`.

For deeper production recipes, load the matching branch of the [Effect skill](../../effect/SKILL.md). Use the [v4 API reference](https://effect.website/docs/v4/api) to navigate additional capabilities; the local compatible implementation remains authoritative.

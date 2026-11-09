# Service guarantees and behavioral tests

Read for substitutable adapters, stateful services, or concurrency-sensitive
changes. Apply only the guarantees relevant to the requested domain. This guide
adds semantic checks to the main skill's Service, instrumentation, documentation,
and companion-file requirements; it does not prescribe new infrastructure.

## Establish the contract before choosing APIs

Resolve guarantees from public callers, implementation, and existing tests.
Describe them at their owning service/type, including meaningful limits:

| Responsibility | Decisions to establish |
| --- | --- |
| Dependencies | Which capabilities callers require; which services execution supplies; which implementation dependencies Layers hide |
| State | Permitted transitions, ownership/version tokens, terminal states, and accounting that changes together |
| Atomicity | The indivisible transition; rollback guarantees; effects before/after commit; what can remain after failure |
| Identity/replay | Stable identity, deduplication scope and lifetime, conflicts, and side effects a retry may repeat |
| Collections | Ordering, positional results, pagination tie-breaks, concurrency limits, and batch partial-commit semantics |
| Lifetime | Resource/fiber owner, readiness, interruption, cleanup, and shutdown behavior |
| Boundaries | Encoded versus decoded data, malformed persisted values, secret-storage policy, and declared adapter capabilities |

Preserve observed behavior during a refactor. Do not invent stronger guarantees
because an Effect API looks suitable. Several individually atomic operations do
not form one transaction; interruption masking does not establish storage
atomicity. If a batch may partly commit, document the actual subset/order policy
and whether replay is safe with stable versus newly generated identities.

Keep service requirements narrow. A producer need not acquire an executor just
to submit work; a handler's per-run identity should be supplied by its executor.
Use existing typechecking or focused type assertions to verify these boundaries
when they change. Avoid weakening schemas or erasing requirements to make a
Layer graph compile. Build structural seams toward owning leaves to avoid cycles.

## Test the same guarantees across implementations

Use a reusable suite parameterized by a fresh, fully provided Layer factory.
Each case gets isolated state and the same starting conditions. Run relevant
behavioral assertions against the test implementation and live adapter; keep
adapter-specific capability tests separate. A fake must preserve the guarantees
used by its consumers, including documented capability restrictions.

The following focused example declares an exclusive ownership contract: a key
can be acquired once, and only its current owner can release it. It demonstrates
the test harness, not a complete application service. In real code, use the
existing service and `.types.ts` contract, instrumentation, and root `tests/`
fixtures. The factory must start with no claimed keys and provide all external
dependencies, while retaining scoped acquisition and cleanup.

```ts
import { describe, expect, it } from "@effect/vitest"
import { Context, Data, Effect, Layer } from "effect"

/** An operational storage failure, distinct from a refused claim. */
export class ClaimsError extends Data.TaggedError("ClaimsError")<{
  /** Safe diagnostic describing the failed storage operation. */
  readonly message: string
}> {}

/** Exclusive claims: duplicate acquisition and stale release return false. */
export class Claims extends Context.Service<Claims, {
  readonly acquire: (key: string, owner: string) => Effect.Effect<boolean, ClaimsError>
  readonly release: (key: string, owner: string) => Effect.Effect<boolean, ClaimsError>
}>()("example/Claims") {}

/**
 * Registers the same ownership guarantees for a provided implementation.
 *
 * @typeParam E - Failures from acquiring the test Layer.
 * @param label - The implementation name used in test reports.
 * @param freshLayer - Supplies an isolated, initially empty Claims service.
 * @returns Registers the suite; each Effect test acquires and closes its Layer.
 */
export const claimContract = <E>(
  label: string,
  freshLayer: () => Layer.Layer<Claims, E>
): void => {
  describe(label, () => {
    it.effect("refuses acquisition of an owned key", () =>
      Effect.gen(function*() {
        const claims = yield* Claims
        expect(yield* claims.acquire("invoice-1", "a")).toBe(true)
        expect(yield* claims.acquire("invoice-1", "b")).toBe(false)
      }).pipe(Effect.provide(freshLayer())))

    it.effect("stale release cannot remove the current owner", () =>
      Effect.gen(function*() {
        const claims = yield* Claims
        yield* claims.acquire("invoice-1", "a")
        expect(yield* claims.release("invoice-1", "b")).toBe(false)
        expect(yield* claims.acquire("invoice-1", "b")).toBe(false)
        expect(yield* claims.release("invoice-1", "a")).toBe(true)
        expect(yield* claims.acquire("invoice-1", "b")).toBe(true)
      }).pipe(Effect.provide(freshLayer())))

    it.effect("concurrent contenders have exactly one winner", () =>
      Effect.gen(function*() {
        const claims = yield* Claims
        const results = yield* Effect.all([
          claims.acquire("invoice-1", "a"),
          claims.acquire("invoice-1", "b")
        ], { concurrency: 2 })
        expect(results.filter(Boolean)).toHaveLength(1)
      }).pipe(Effect.provide(freshLayer())))
  })
}
```

Call the suite once for each implementation using the owner's existing fixture
factory. Setup failure must fail the case rather than be converted into a domain
success. The concurrency option starts competing work but does not prove a
particular interleaving: use an explicit barrier/fault point for a precise race,
and exercise genuine transactions/connections when that boundary matters.

The earlier schema-error version of this harness was typechecked and executed
on 2026-10-05 with Effect and
`@effect/vitest` 4.0.0-rc.113 and Vitest 5.0.0. Six cases passed across two isolated
in-memory fixtures, and the stale-release case rejected a deliberately broken
fixture. This validates the harness, not any live adapter or every target version.

For production-key plus inspection-key testing over the same acquired instance,
reuse `Layer.effectContext` from the Effect skill's
[testing recipes](../../effect/references/TESTING.md).
Do not build independent stores for code-under-test and assertions or substitute
module mocks for the service seam.

## Select meaningful boundary verification

- Time-dependent behavior: establish readiness with Deferred/Queue/Latch before
  TestClock advancement. Where application time owns database/script decisions,
  pass Clock-derived time to that boundary instead of hardcoding live time.
  Preserve server-authoritative time when it is an existing requirement. Add
  focused `it.live` coverage for actual time/network behavior when needed.
- Persistence: exercise the actual JSON/driver round trip, rich schema values,
  optional versus null values, malformed records, and secret encoding policy.
  An in-memory success does not establish a serializing driver's behavior.
- Atomicity/recovery: test stale ownership, competing transitions, failure after
  partial progress, replay, and cancellation/shutdown at the affected boundary.
  Pick adversarial cases for the changed guarantees instead of mirroring code.
- Diagnostics: retain the main skill's standalone operation metrics/logs/span
  checks and real sink verification. A contract suite is additional evidence.
- Availability: report skipped/unavailable live adapter coverage. Use existing
  local fixtures/CI services; provision new external infrastructure only within
  the user's authorized scope.

## Reviewed case studies

Patterns were informed by the pinned effect-mq snapshot
`b5898fbae56fe926c28768a5a8ff9ad74f1e57a0`:
[store contracts](https://github.com/TeamWarp/effect-mq/blob/b5898fbae56fe926c28768a5a8ff9ad74f1e57a0/packages/effect-mq/src/JobStore.ts#L850),
[shared conformance](https://github.com/TeamWarp/effect-mq/blob/b5898fbae56fe926c28768a5a8ff9ad74f1e57a0/packages/effect-mq/src/testing/conformance.ts#L67),
and [real PostgreSQL testing](https://github.com/TeamWarp/effect-mq/blob/b5898fbae56fe926c28768a5a8ff9ad74f1e57a0/packages/effect-mq/test/drizzle-postgres/DrizzleJobStore.test.ts#L38).
These are optional design evidence, not dependencies or drop-in implementation
templates. Verify every selected API against the target project's installed pin.

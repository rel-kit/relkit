# Typed errors and recovery

Read before implementing or changing domain failures or recovery. Define the
requested failure contract for new code; preserve existing public contracts
unless the task explicitly changes them. Choose handling from the domain's actual recovery needs;
making E become `never` is not a goal by itself. Check APIs against the installed
version using the main skill's source rules.

## Choose the error representation

- Use `Data.TaggedError("Domain.Error")<{ readonly ... }>` for new in-process
  expected failures. Tags must distinguish variants across composed error unions;
  reusing a tag makes selective handlers indistinguishable. The class is both
  constructor and type; do not duplicate it as an interface or hand-roll `_tag`.
- Choose `Schema.TaggedError` when the error itself needs validation, persistence,
  RPC encoding, or another codec contract. Being a domain/adapter error alone
  does not require a schema. Keep compatible existing public constructors/codecs.
- Include stable identity, operation, and useful safe context. Preserve the
  original cause at translation boundaries where appropriate; a cause field is
  not an Effect `Cause`. Document every payload field next to its declaration:
  what it identifies, units/constraints, why recovery needs it, and whether it
  contains sensitive data. Use a typed SDK error or Error for normalized causes;
  never author unknown or replace it with an opaque alias/any. Foreign rejection
  values may be retained by the platform Error cause mechanism at a required
  compatibility boundary. Never log raw causes/payloads without redaction review.
- `Effect.fail(error)` creates an expected failure. Inside a generator,
  `return yield* new DomainError(...)` is equivalent, not a throw. Use
  `Effect.failSync` when constructing the failure must wait for execution.

Sources: [expected errors](https://effect.website/docs/v4/error-management/expected-errors),
[yieldable errors](https://effect.website/docs/v4/error-management/yieldable-errors).

## Translate foreign failures once

Reuse an existing Effect adapter and its typed errors before wrapping an SDK.
For a foreign API, use `Effect.try` for a throwing call or `Effect.tryPromise`
for rejection; perform the call inside the lazy callback. Classify known outcomes
structurally, not by arbitrary message matching. Decode unknown data with Schema
and translate parse failures only when the domain needs a different contract.
Do not repeatedly wrap an already meaningful domain error at each service hop.

This adapter example assumes the supplied SDK declares read rejections as
operational failures. If its rejection channel also contains programming bugs,
classify those separately instead of labelling every rejection retryable.

```ts
/**
 * Converts document SDK rejections to typed read failures while retaining their cause.
 * Callers receive cancellable lazy reads; the application owns the SDK connection.
 * The error carries document identity for recovery, never automatic retry permission.
 */
import { Data, Effect } from "effect"

/** A failed document read; no serialization contract is required. */
export class DocumentReadError extends Data.TaggedError("Documents.ReadError")<{
  /** Tenant-local document identity needed to identify the failed read. */
  readonly id: string
  /** Adapter diagnostic whose cause retains the original SDK rejection; do not log raw. */
  readonly cause: Error
}> {}

/**
 * Suspends one SDK read and retains its operational rejection.
 * @param read - SDK operation that accepts cancellation.
 * @param id - Document identifier passed unchanged to the SDK.
 * @returns A lazy read with DocumentReadError in its typed failure channel.
 */
export const readDocument = Effect.fn("Documents.readAdapter")((
  read: (id: string, signal: AbortSignal) => Promise<string>,
  id: string
) => Effect.tryPromise({
  try: (signal) => read(id, signal),
  catch: (cause) => new DocumentReadError({
    id,
    cause: new Error("Document SDK read failed", { cause })
  })
}))
```

Passing an AbortSignal does not prove the SDK stops work; verify its support.
Use `Effect.sync` only when a thrown exception should be a defect. A throw inside
an Effect callback, even of a tagged error, is not a typed `Effect.fail`.

## Preserve defects and cancellation

Use `Effect.die` for a violated invariant, not an ordinary missing record or
network outage. `Effect.orDie` changes the contract; do not use it to silence E.
Typed catch/match/result operators propagate pure defect/interruption Causes, but
that is not a guarantee for mixed Causes. In 4.0.1, typed extraction can select a
Fail reason from Fail + Die/Interrupt and recover without preserving its siblings.
Where parallel work/finalizers can combine reasons, inspect the complete Cause
before recovery. Recover only the explicitly allowed shape (for example one Fail
of a recoverable tag); re-fail every other Cause unchanged. Keep E broad enough to
represent retained mixed failures; never cast away error variants to claim narrowing.
Test pure failures, pure defects/interruption, and mixed Causes independently.
At an intentional supervisor or application boundary, `Effect.exit` exposes the
complete outcome. `catchDefect`, `catchCause`, and Cause matching need an explicit
continuation policy; preserve unhandled causes with `Effect.failCause`.
Do not log cancellation as an ordinary operational error or recover it into a
success that restarts cancelled work.

Source: [unexpected errors](https://effect.website/docs/v4/error-management/unexpected-errors).

## Recover or inspect at the owning boundary

| Need | Select and verify |
| --- | --- |
| Recover a known variant | `catchTag` / `catchTags`; unmatched variants stay in E |
| Recover selected conditions | `catchIf` or `catchFilter`; preserve everything else |
| Translate a typed error | `mapError`; do not discard useful discriminants or cause |
| Inspect typed outcomes as data | `result`; use `option` only if every typed failure means absence |
| Recover every expected failure | `catch`, only when the boundary can handle every variant |
| Default success | `orElseSucceed` is lazy but handles every typed error; prefer selective recovery for missing data |
| Try ordered alternatives | `firstSuccessOf` stops on success and otherwise returns the last typed error; require non-empty input |
| Map success/failure with pure handlers | `match`; a Promise return does not become managed Effect work |
| Run success/failure effects | `matchEffect`; account for handler E/R requirements |
| Inspect complete outcomes | `matchCause` / `matchCauseEffect` at a deliberate supervision boundary |

Keep fallback lazy and truthful. Authorization failure or database outage must
not silently become an empty result unless that is the established contract.
`ignore` drops typed failures; `ignoreCause` can also swallow defects/cancellation.
Neither is a default cleanup or logging strategy. Nested tagged `reason` fields
can use version-verified `catchReason`/`catchReasons` when that error model exists;
do not flatten it just to match a tag.

Sources: [fallback](https://effect.website/docs/v4/error-management/fallback),
[matching](https://effect.website/docs/v4/error-management/matching).

## Bound retries and timeouts deliberately

Retry only classified transient, replay-safe operations. Keep stable retry
identity outside the repeated action and use a lazy action that performs fresh
work on each attempt. Retrying a previously started Promise does not retry I/O.
Use `Effect.retry` with bounded attempts and a verified `Schedule` for backoff
and jitter. `times: n` / `Schedule.recurs(n)` permits n retries after the initial
attempt. Filter permanent failures; defects and interruption are not retryable
typed failures. Place retry around the smallest safe action, not an entire
workflow with already-committed side effects. `retryOrElse` is appropriate only
when exhaustion has a valid fallback. Preserve the final failure otherwise.

`timeout` adds `Cause.TimeoutError`. `timeoutOption` makes only timeout absence,
retaining other source errors. `timeoutOrElse({ duration, orElse })` can produce
a domain timeout error or a lazy fallback. Preserve timely source failures.

Placement changes policy: timeout inside retry limits each attempt; timeout
outside retry limits the whole operation including waits. Retry budgets do not
interrupt a stuck attempt. Timeout requests interruption and waits for cleanup;
uninterruptible work or an uncancellable foreign call can exceed wall-clock
expectations. Do not detach work merely to return early. Verify attempt counts,
permanent-error exclusion, exhaustion, readiness before TestClock advancement,
and cleanup after cancellation using focused tests.

Sources: [retrying](https://effect.website/docs/v4/error-management/retrying),
[timing out](https://effect.website/docs/v4/error-management/timing-out).

## Preserve multiple failures

Sequential workflows stop at failure; concurrent fail-fast traversals interrupt
siblings, but multiple fibers or cleanup can still fail. v4 `Cause.reasons` is
flat (`Fail`, `Die`, `Interrupt`), not a v3 sequential/parallel tree. Do not infer
execution order from it. An interrupt reason alongside a defect is not a clean
cancellation; inspect all relevant reasons rather than dropping everything
after finding one error. Preserve the complete cause when re-failing.

For independent validation, use `validate` to accumulate typed failures or
`partition` to retain successes and failures; this is a deliberate change from
fail-fast semantics, not generic recovery. Verify concurrency bounds, partial
work and sibling finalization. Do not present accumulated typed results as proof
that defects and interruption were handled.

Source: [parallel and sequential errors](https://effect.website/docs/v4/error-management/parallel-and-sequential-errors).

## Source and acceptance checks

Inspect `Data.ts`, `Effect.ts`, `Cause.ts`, `Exit.ts`, `Result.ts`, `Schedule.ts`
and their delegates/tests under the verified Effect source. For schema-backed
errors also inspect `Schema.ts`. Check relevant tagged-error construction,
selected recovery, defect preservation, cancellation, retry, timeout and Cause
tests rather than assuming signatures from memory. The adapter snippet was
typechecked and exercised against Effect 4.0.1; recheck the target project's pin.

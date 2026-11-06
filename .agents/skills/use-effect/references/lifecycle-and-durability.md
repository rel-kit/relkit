# Context ownership, worker outcomes, and durable recovery

Read the applicable sections for callbacks that outlive registration, scoped
workers, or persisted/delayed work. Preserve the requested domain and its
infrastructure. Ordinary finite workflows do not need an outbox, lease protocol,
reconciliation loop, or persistence added merely to use this guide.

## Keep acquisition, registration, and execution distinct

Prefer capturing explicit service implementations during Layer acquisition.
When an API must capture registration Context for later execution, identify
which dependencies remain valid and which ambient values belong to each run:

| Context | Ownership rule |
| --- | --- |
| Shared dependencies | Acquired once in their owning Layer; live until all work using them finishes |
| Handler-specific dependencies | Preserve the intended local override; a first registrant's context must not silently configure every handler |
| Scope | Resources remain within their real owner's lifetime; capturing a Scope or removing its tag does not extend acquired resources' lifetimes |
| Tracing and run identity | Supply the current span/request/job context at execution; avoid restoring a stale registration span or identity |
| Fiber-local settings | Decide deliberately which settings inherit or are captured; preserve the main skill's local log-level override and sibling-isolation guarantees |

Capture only what the contract needs. If broad capture is unavoidable, omit
runtime-owned keys deliberately and verify context merge precedence against the
installed version. Keep maintenance fibers in the worker's own context. Stop
and await users of resources before their owning scope releases those resources.
Test two locally configured handlers, registration closure, current-run context,
and parent/sibling isolation when relevant.

## Define outcomes before supervising a worker

Scope and supervise worker fibers; Layer acquisition must return. Restrict
masking to the ownership handoff/settlement that must be protected, restoring
interruptibility around waiting and user work. Local masking does not replace
database transactions or make an uncancellable SDK cancellable.

| Event | Domain decision to make and verify |
| --- | --- |
| Typed handler failure | Which variants can retry, with what budget/deadline, and which side effects are safe to replay |
| Defect or mixed Cause | Preserve evidence and choose supervision/terminal behavior; do not hide a defect merely because interruption is also present |
| User cancellation | When it becomes terminal, how it races completion/retry, and which actor delivers and observes cleanup |
| Owner shutdown | Drain, release, or terminate work according to the existing contract; account for attempts/permits consistently |
| Handler self-interruption | Define its outcome separately from owner shutdown where confusing them would revive work indefinitely |
| Supervisor timeout | Preserve the distinction from a handler's own typed timeout failure; verify cleanup and attempt accounting |
| Lost ownership/lease | Guard settlement with the expected identity/version; preserve lock-loss evidence and assume side effects may already have happened |
| Result encoding failure | Surface the failure; avoid replaying completed side effects unless the domain proves replay safe |

A shared heartbeat/supervisor must not wait for arbitrary user finalizers before
servicing other work. Deliver cancellation without blocking that shared loop,
using an appropriate version-verified mechanism; observe and await completion
through the task's owner. Do not turn nonblocking delivery into detached cleanup.
Test slow cleanup alongside an unrelated in-flight task.

Contain record-specific failures at their owning boundary when processing should
continue, with actionable diagnostics. Keep systemic/exhausted failures visible.
Optional reporting hooks should have an explicit failure policy and must not
silently corrupt the settled result or kill unrelated work.

## Load durable recovery only for persisted/distributed work

An in-process retry or Schedule does not survive runtime loss. Preserve existing
delivery guarantees and distinguish submission identity from temporary dedup
windows. At-least-once processing requires domain idempotency; exclusive claims
or deterministic job IDs do not establish exactly-once external side effects.

For changes to an existing durable workflow, establish the relevant boundaries:

- Persist phase/eligibility so restarted workers can determine what remains.
  Avoid holding a worker slot or lease through long backoff when durable
  eligibility already represents the delay.
- Commit a business transition and its recovery/reporting intent together when
  they must not diverge. Use the existing transaction/native atomic primitive;
  verify its rollback and failure semantics rather than assuming them.
- Deliver persisted intent with stable identity; remove/mark it only after the
  destination has accepted it under an idempotent protocol. Handle ambiguous
  responses and crashes before acknowledgment deliberately.
- Reconcile from authoritative state where notifications or intermediate work
  can be lost. Treat wake messages as hints, with a version/cursor or equivalent
  protocol covering the observation-to-wait race and a recovery fallback.
- Bound pages/concurrency and preserve required ordering. Where work may proceed
  independently, one poison record or unavailable destination should not pin
  every page; rotate or advance cursors according to the contract.
- Couple occurrence claiming and advancement when a durable schedule promises
  one submission per occurrence. Verify stale contenders and retention/replay
  interactions; do not infer the guarantee from a deterministic ID alone.
- Preserve recovery evidence until owed reporting/cancellation work completes.
  Retention/index cleanup must not erase the only record of pending obligations.

Test the changed crash windows with controllable fault points: committed work
before notification, delivery before acknowledgment, outage and recovery,
duplicate reports, and retention while obligations remain. Use the same
[behavioral contracts](contracts-and-testing.md) at real storage boundaries when
in-memory state cannot establish these guarantees. Reuse existing workflow
engines/libraries where appropriate; do not build queue infrastructure during an
unrelated service refactor.

## Define diagnostic meaning across delayed boundaries

Specify whether a counter records local attempts, accepted transitions, or
durable business events. Redelivery should affect only the dimensions intended
by that definition. Keep IDs in logs/traces and bounded labels in metrics; make
expensive depth sampling opt-in or follow existing configured behavior.

When work crosses processes or long delays, decide whether the execution span
continues a producer trace or starts a trace with a causal link. Preserve the
sampling/propagation policy; record only required trace context and test the
relationship. Reuse shared instrumentation and provision exporters at runtime
edges, retaining the main skill's actual sink and failure/outcome checks.

## Reviewed case studies

The pinned effect-mq snapshot `b5898fbae56fe926c28768a5a8ff9ad74f1e57a0`
illustrates [registration context](https://github.com/TeamWarp/effect-mq/blob/b5898fbae56fe926c28768a5a8ff9ad74f1e57a0/packages/effect-mq/src/Worker.ts#L1393),
[heartbeat cancellation](https://github.com/TeamWarp/effect-mq/blob/b5898fbae56fe926c28768a5a8ff9ad74f1e57a0/packages/effect-mq/src/Worker.ts#L1099),
and [outage recovery](https://github.com/TeamWarp/effect-mq/blob/b5898fbae56fe926c28768a5a8ff9ad74f1e57a0/packages/effect-mq/test/Flow.test.ts#L259).
These are optional semantic examples. They do not authorize copying low-level
unsafe APIs, library-specific error conversion, or a particular retry policy.

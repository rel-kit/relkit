# Concurrency, coordination, and ownership

Read before choosing execution order, starting fibers, or coordinating shared work
in new implementations and refactors. Prefer the matching Effect primitive over
custom Promise pools, resolver registries, boolean polling, timers, locks, or
message arrays. Actively look for independent work that benefits from bounded
concurrency; retaining sequential execution needs a real ordering, dependency,
atomicity, or resource constraint. Do not add background infrastructure to a
finite traversal or force unrelated APIs into the domain.

## Choose from the responsibility

| Need | Preferred tool | Decision to preserve |
| --- | --- | --- |
| Finite independent operations | Effect.forEach / all with explicit concurrency | Limit, output order, fail-fast versus typed outcome collection |
| Independent task with its own lifetime | Scoped fiber, FiberSet / FiberMap when needed | Owner, failure observer, cancellation and cleanup |
| One result shared by waiters | Deferred | Success/failure/cancellation settlement and completing actor |
| Each job handled by one competing consumer | Queue | Capacity, acceptance, pending producers, drain versus discard |
| Each current observer receives events | PubSub | Subscriber readiness, slow-consumer policy and permitted loss |
| Shared simultaneous access limit across callers | Semaphore | Permit count and lifetime of the shared budget |
| Repeated pause/resume or open/closed gate | Latch | Admission point, current waiters versus later arrivals |
| Current state plus subsequent changes | SubscriptionRef | Atomic state updates and scoped observations |

## Bound execution intentionally

Effect.forEach/all defaults to sequential execution in the reviewed version.
Set a finite positive concurrency value from the domain/config when independent
I/O should overlap. Preserve sequential execution for dependency chains,
stateful folds, ordered side effects, and adapters that cannot safely overlap.
Result ordering does not serialize side effects. Returned values can stay in
input order even when completion order differs.

A traversal limit applies to that invocation. Concurrent callers and nested
traversals can multiply total load: acquire one shared Semaphore in the service's
make when they compete for the same external capacity. Queue capacity limits
buffered work, not running jobs or arbitrarily many blocked producer fibers.
Bound ingress as well as worker count. Avoid unbounded traversal unless the
input is demonstrably small/bounded or another justified budget controls it.

Choose failure policy deliberately: fail-fast interruption does not roll back
already completed effects; collecting typed results propagates pure defects/interruption but can discard
sibling reasons from mixed Causes in 4.0.1. Apply the complete-Cause recovery
policy in errors-and-recovery.md when combined reasons are possible. Races must specify first success versus first completion and own
loser cleanup. Fibers overlap asynchronous work, not CPU execution across threads;
use a worker/platform boundary for CPU parallelism rather than extra forks.

## Fibers: execution and failure ownership

Use forkChild for work tied to its current parent; use forkScoped for a service's
owned Scope or forkIn for an explicitly chosen owner. A make that starts workers
must return after readiness, not execute its forever loop inline. Do not use a
child tied to the short-lived acquisition fiber for a long-lived service worker.
Use traversal rather than manually forking and joining ordinary finite lists.

Fiber.join propagates the outcome; Fiber.await returns Exit for deliberate
inspection. Owning lifetime does not by itself propagate every worker failure
to callers: join or supervise it and settle pending replies on terminal failure.
Fiber.interrupt waits for finalizers. Nonblocking cancellation delivery needs a
separate owner that still observes completion. Restrict interruption masking to
ownership handoff/release; propagate AbortSignal to capable foreign APIs.
A shutdown signal or race only requests termination; it does not make the owner
await every caller's finalizers. Work using scoped dependencies must finish cleanup
before those dependencies are released, including direct calls outside worker loops.
Never detach by default. See lifecycle-and-durability.md for worker settlement.

Guide: [Fibers](https://effect.website/docs/v4/concurrency/fibers).
Source/tests: Effect.ts, Fiber.ts, internal/effect.ts; Fiber/Effect fork tests.
For dynamic/keyed tasks inspect FiberSet/FiberMap and their tests as well.

## Deferred: one completion, many waiters

Use Deferred.make<A, E>, await, succeed/fail, or done with a computed Exit for
startup readiness, request replies, or completion shared by several waiters.
The first completion wins; later attempts report false. Settle it on every
terminal producer path, including defects, interruption and owner shutdown,
so callers do not wait forever. Interrupting one waiter does not cancel the
producer or other waiters automatically; define that policy explicitly.

complete runs an effect and shares its resulting completion; completeWith stores
an effect that awaiters may execute separately. Do not use completeWith for a
side effect intended to happen once. A Deferred arbitrates a result, not an
exactly-once external operation: racing producers can both perform side effects
before one completes it. Give production work a single owner or use the matching
Cache/request-coalescing API when deduplication is actually required.

Guide: [Deferred](https://effect.website/docs/v4/concurrency/deferred).
Source/tests: Deferred.ts; completion, completeWith and interrupted-waiter tests.

## Queue: distribute work and bound pending demand

Choose bounded/make with capacity for backpressure; dropping refuses new overflow,
sliding evicts older buffered values, and unbounded requires a justified memory
bound. Each item goes to one consumer; FIFO dequeue does not guarantee processing
completion order. Check offer acceptance and offerAll leftovers. Expose Enqueue
or Dequeue capabilities when consumers should not control the entire queue.

Queue<A, E> carries terminal failures. In 4.0.1, end uses Cause.Done and allows
draining; fail/failCause retain buffered work before termination. shutdown
instead discards buffered messages and releases pending operations: an open
queue interrupts, while an already-closing queue retains its existing cause.
Do not treat shutdown as graceful draining or assume v3 shutdown semantics.
Register queue cleanup in its owning scope. Resolve/interrupt replies associated
with discarded jobs, and observe consumer termination. An in-memory queue does
not provide durable delivery, acknowledgement, or exactly-once processing.

Guide: [Queue](https://effect.website/docs/v4/concurrency/queue).
Source/tests: Queue.ts; offerAll backpressure, interruption, end, fail and shutdown.

## PubSub: broadcast with explicit loss and slow-consumer policy

Use PubSub for notifications to multiple observers, not competing workers.
Subscribe before publishing events the observer must receive; subscribe is
scoped and the owner must also finalize the hub. Read with PubSub.take on its
Subscription in the pinned API; do not assume a Queue.Dequeue implementation.
Without replay, past events are unavailable to late subscribers. Optional replay
is bounded history, not durable delivery or an authoritative current-state model.

Bounded publication may wait for a slow subscriber. Dropping/sliding allow loss;
choose those only when the domain permits it, and account for rejected publishes.
Unbounded buffering can grow without bound. Publishing success says nothing
about subscriber processing success. Keep nonessential telemetry from blocking
critical job settlement. Check the pinned end versus shutdown contract before
using a terminal-event protocol; ordinary unsubscribe and hub shutdown differ.
In 4.0.1, end retains a final message after buffered events and subsequent takes
keep returning it; consumers must stop explicitly rather than loop on that value.

Guide: [PubSub](https://effect.website/docs/v4/concurrency/pubsub).
Source/tests: PubSub.ts; slow/late subscribers, replay, publish cancellation,
unsubscribe, end and shutdown; Stream.fromPubSub where consumption is streaming.

## Semaphore: a shared concurrency budget

Allocate Semaphore.make(permits) once in the owning service make when the budget
must span callers. Prefer withPermit/withPermits around the actual protected
operation: release is handled on success, failure and interruption. A semaphore
created inside each call cannot enforce a service-wide limit. Keep unrelated
waiting, notifications and backoff outside a permit unless the protected resource
really remains occupied during them.

Validate permit counts and requested weights; requests larger than the available
total can wait forever. One permit gives mutual exclusion, not reentrant locking
or a database transaction. Avoid nested acquisition of the same budget and define
lock order for multiple locks. take/release requires a justified, protected
ownership protocol; releaseAll is not a substitute for each caller releasing
its own permits. Do not claim FIFO fairness without verifying the actual API.

Guide: [Semaphore](https://effect.website/docs/v4/concurrency/semaphore).
Source/tests: Semaphore.ts; withPermits acquisition/queued interruption and release.

## Latch: a reusable admission gate

Use Latch.make, await/whenOpen, open and close for pause/resume or readiness without
a payload. A closed latch suspends arrivals; open admits current and later waiters.
close affects later admission and does not revoke work that already passed.
release wakes current waiters while leaving the latch closed for later arrivals;
it is a pulse, not a saved signal for future waiters. Do not use a latch as a
permit counter, a mutual-exclusion lock, or a completion value.

Choose exactly where work passes the gate relative to dequeue and permit
acquisition. Document whether pause permits already-admitted work to finish.
Avoid holding a scarce permit while indefinitely paused. Shutdown must interrupt
or release waiting fibers through their real owner, not leave callers suspended.
Use Deferred when readiness needs a failure/result; a latch alone cannot convey it.

Guide: [Latch](https://effect.website/docs/v4/concurrency/latch).
Source/tests: Latch.ts and internal/effect.ts; open/close, release/late-arrival and
interrupted-waiter tests.

## Deterministic acceptance

Test applicable choices alongside all existing service/error/style gates:

- Prove work overlaps and maximum active work stays within the bound, including
  simultaneous calls sharing one service. Assert result order separately from
  start/completion order. Prove the test would fail for serial or unbounded work.
  Keep the initial wave blocked until excess candidates have had a verified
  opportunity to start: releasing at the first two starts can hide a missing cap.
- Establish readiness with Deferred or a registered subscription before racing,
  cancelling, opening a gate, publishing, or advancing TestClock. A sleep or
  arbitrary sequence of yieldNow calls is not a readiness protocol. For primitive
  waiter tests, verified startImmediately plus suspended-fiber inspection may be
  appropriate; explain it locally rather than introducing production unsafe APIs.
- Exercise typed failure, defects, interruption, mixed Causes and sibling cleanup.
  Verify permit recovery, producer/consumer cancellation, queue saturation,
  draining/discard and reply settlement after scope closure.
- Verify Deferred first-completion and failed/interrupted producer policies; test
  latch reclose and release versus late waiters; test PubSub two-subscriber
  delivery, late subscription, chosen overflow and unsubscribe/shutdown behavior.
- Test real operation logs/metrics and retained request Context under concurrency;
  annotations must not leak across callers, nor high-cardinality values into metrics.

Version baseline: reviewed against the six v4 guides, installed Effect 4.0.1
implementations and matching upstream module tests. Follow workflow-and-sources.md
for repos/effect discovery and version compatibility; do not copy older examples
or install another version to make an assumed signature work.

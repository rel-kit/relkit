import { makeDeliveryRunner } from "./delivery-runner.js";
import { promiseDelivery } from "./delivery.adapter.js";
import { deliverySnapshot } from "./delivery-inspection.js";
import { normalizeId } from "@relkit/contracts";
import type { UnknownEventEnvelope } from "@relkit/events";
import { Clock, Context, Effect, Layer, Ref, Semaphore } from "effect";
import {
  localOperation,
  localPromise,
  localSync,
  runLocal,
  runLocalSync,
} from "../local-effect.js";
import { createJobQueue } from "../jobs/queue.js";
import { createJobStore } from "../jobs/store.js";
import { normalizeEnvelope } from "./router-records.js";
import {
  admitDelivery,
  ledger,
  normalizeRetry,
  positive,
  resultFrom,
  retryDelivery,
  validateStoredData,
} from "./delivery-utils.js";
import {
  EVENT_DELIVERY_CAPABILITIES,
  type EventDelivery,
  type EventDeliveryBinding,
  type EventDeliveryOptions,
  type EventDeliveryResult,
} from "./delivery-types.js";
import type { EventDeliveryEffects } from "./delivery.service.types.js";

export { EVENT_DELIVERY_CAPABILITIES } from "./delivery-types.js";
export type {
  EventDelivery,
  EventDeliveryBinding,
  EventDeliveryBoundary,
  EventDeliveryLedgerRecord,
  EventDeliveryOptions,
  EventDeliveryResult,
  EventDeliverySnapshot,
} from "./delivery-types.js";

/** One trigger owns durable admission, retry transitions and handler concurrency. */
export class LocalEventDeliveryService extends Context.Service<
  LocalEventDeliveryService,
  EventDeliveryEffects
>()("@relkit/providers-local/EventDelivery") {}

/**
 * Opens durable at-least-once delivery behind its existing Promise API.
 * @param root - Trigger-owned journal directory.
 * @param binding - Compiled target and delivery policy.
 * @param options - Deterministic clock, retry entropy and durable boundary hooks.
 * @returns A delivery owner whose close joins admitted handlers before its store closes.
 */
export async function createEventDelivery(
  root: string,
  binding: EventDeliveryBinding,
  options: EventDeliveryOptions = {},
): Promise<EventDelivery> {
  const service = await runLocal(makeEventDelivery(root, binding, options));
  return promiseDelivery(service);
}

/**
 * Provides one trigger's delivery service with scope-owned shutdown.
 * @param root - Trigger journal directory.
 * @param binding - Handler and declared policy.
 * @param options - Clock, entropy and fault-injection hooks.
 * @returns A layer interchangeable with deterministic delivery fixtures.
 */
export function eventDeliveryLayer(
  root: string,
  binding: EventDeliveryBinding,
  options: EventDeliveryOptions = {},
) {
  return Layer.effect(
    LocalEventDeliveryService,
    Effect.acquireRelease(makeEventDelivery(root, binding, options), (service) =>
      service.close().pipe(Effect.orDie),
    ),
  );
}

/**
 * Recovers a trigger and composes its serialized admission and bounded execution.
 * @param root - Owned durable directory.
 * @param binding - Handler target and policy.
 * @param options - Native dependency options.
 * @returns A lazy typed acquisition effect; callbacks expose no cancellation channel.
 */
export const makeEventDelivery = Effect.fn("EventDelivery.open")(
  function* (root: string, binding: EventDeliveryBinding, options: EventDeliveryOptions = {}) {
    const triggerId = yield* localSync(() => normalizeId(binding.id));
    const concurrency = yield* localSync(() => {
      if (typeof binding.invoke !== "function")
        throw new TypeError("Event delivery target is required");
      const requested = options.concurrency ?? binding.concurrency;
      return requested === undefined ? Number.MAX_SAFE_INTEGER : positive(requested, "concurrency");
    });
    const retryPolicy = yield* localSync(() => normalizeRetry(options.retry ?? binding.retry));
    /**
     * Reads the configured delivery clock or caller Effect Clock.
     * @returns A lazy effect yielding current milliseconds.
     */
    const now = () =>
      options.now === undefined ? Clock.currentTimeMillis : localSync(options.now);
    /**
     * Reads the delivery clock at a native compatibility boundary.
     * @returns Current milliseconds from the owning clock.
     */
    const clock = () => runLocalSync(now());
    const store = yield* localPromise(() =>
      createJobStore(root, {
        now: clock,
        ...(options.onBoundary === undefined ? {} : { onBoundary: options.onBoundary }),
        validateData: validateStoredData,
      }),
    );
    const queue = yield* localSync(() =>
      createJobQueue(store, {
        now: clock,
        ...(options.ownerToken === undefined ? {} : { ownerToken: options.ownerToken }),
        ...(options.leaseDurationMs === undefined
          ? {}
          : { leaseDurationMs: options.leaseDurationMs }),
      }),
    );
    yield* localPromise(() => queue.ready());
    const admission = yield* Semaphore.make(1);
    const executions = yield* Semaphore.make(concurrency);
    const closed = yield* Ref.make(false);
    /**
     * Checks whether the owner still admits new operations.
     * @returns A lazy validation effect failing with the established closed-owner error.
     */
    const ensureOpen = () =>
      localSync(() => {
        if (Ref.getUnsafe(closed)) throw new Error("Event delivery is closed");
      });
    /**
     * Deduplicates and persists acceptance under the trigger admission permit.
     * @param input - Caller operation input.
     * @returns The lazy accepted delivery receipt after durable acknowledgement.
     */
    const accept = Effect.fn("EventDelivery.accept")(
      function* (input: UnknownEventEnvelope) {
        yield* ensureOpen();
        const envelope = yield* localSync(() => normalizeEnvelope(input));
        const accepted = yield* admission.withPermits(1)(
          localPromise(() =>
            admitDelivery(queue, envelope, triggerId, binding.profile ?? "default"),
          ),
        );
        const status =
          accepted.entry.state === "completed"
            ? "completed"
            : accepted.entry.state === "dead-lettered"
              ? "failed"
              : "queued";
        return resultFrom(
          accepted.entry,
          triggerId,
          accepted.duplicate,
          status,
          undefined,
          status === "failed" ? accepted.entry.failure : undefined,
        );
      },
      (effect) => localOperation("EventDelivery.accept", effect),
    );
    const runNext = makeDeliveryRunner({
      queue,
      store,
      binding,
      triggerId,
      executions,
      retryPolicy,
      clock,
      options,
      ensureOpen,
    });
    return LocalEventDeliveryService.of({
      triggerId,
      accept,
      runNext,
      deliver: Effect.fn("EventDelivery.deliver")(
        function* (input) {
          const accepted = yield* accept(input);
          const result = yield* runNext(accepted.deliveryId);
          return result === undefined
            ? accepted
            : { ...result, duplicate: result.duplicate || accepted.duplicate };
        },
        (effect) => localOperation("EventDelivery.deliver", effect),
      ),
      retry: (id) =>
        localOperation(
          "EventDelivery.retry",
          Effect.andThen(
            ensureOpen(),
            localPromise(() => retryDelivery(queue, triggerId, id, clock)),
          ),
        ),
      recover: (time) =>
        localOperation(
          "EventDelivery.recover",
          Effect.gen(function* () {
            yield* ensureOpen();
            yield* localPromise(() => queue.recover(time ?? clock()));
            return ledger(store, triggerId, queue);
          }),
        ),
      snapshot: () => deliverySnapshot(store, triggerId, queue, ensureOpen),
      drain: () =>
        localOperation(
          "EventDelivery.drain",
          Effect.gen(function* () {
            const results: EventDeliveryResult[] = [];
            while (true) {
              const next = yield* runNext();
              if (next === undefined) return Object.freeze(results);
              results.push(next);
            }
          }),
        ),
      close: () =>
        localOperation(
          "EventDelivery.close",
          Effect.gen(function* () {
            if (yield* Ref.get(closed)) return;
            yield* Ref.set(closed, true);
            yield* admission.withPermits(1)(Effect.void);
            yield* executions.withPermits(concurrency)(localPromise(() => store.close()));
          }),
        ),
    });
  },
  (effect) => localOperation("EventDelivery.open", effect),
);

import type { LocalEventProvider, LocalEventEffects } from "./provider.types.js";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { Clock, Context, Effect, Exit, Layer, Ref, Schedule, Scope } from "effect";
import type { EventOperationContext, EventPublishOptions } from "@relkit/events";
import {
  localOperation,
  localPromise,
  localSync,
  runLocal,
  type LocalOperationError,
} from "../local-effect.js";
import type { EventRouterTrigger } from "./router-types.js";
import { createEventLog } from "./log.js";
import { createEventRouter } from "./router.js";
import { createEventAdmin } from "./admin.js";
import type { EventQueryRequest } from "./admin-contracts.js";

export type { LocalEventProvider, LocalEventEffects } from "./provider.types.js";

/** Publication and delivery orchestration for one local event provider. */
export class LocalEventService extends Context.Service<LocalEventService, LocalEventEffects>()(
  "@relkit/providers-local/Events",
) {}

/**
 * Acquires a scoped event provider behind its established Promise surface.
 * @param root - Owned log and router directory.
 * @returns The provider; close joins workers before releasing persisted stores.
 */
export async function createLocalEventProvider(root: string): Promise<LocalEventProvider> {
  const scope = Scope.makeUnsafe();
  let service: LocalEventEffects;
  try {
    service = await runLocal(
      makeLocalEventService(root).pipe(Effect.provideService(Scope.Scope, scope)),
    );
  } catch (error) {
    await runLocal(Scope.close(scope, Exit.void));
    throw error;
  }
  let closed = false;
  return Object.freeze({
    registerContract: (contract: unknown) => runLocal(service.registerContract(contract)),
    registerTrigger: (binding: EventRouterTrigger) => runLocal(service.registerTrigger(binding)),
    query: (request?: EventQueryRequest) => runLocal(service.query(request)),
    publish: (payload: unknown, options: EventPublishOptions, context: EventOperationContext) =>
      runLocal(service.publish(payload, options, context)),
    close: async () => {
      if (closed) return;
      closed = true;
      await runLocal(Scope.close(scope, Exit.void));
      await runLocal(service.health());
    },
  });
}

/**
 * Supplies publication and its supervised delivery workers as one layer.
 * @param root - Provider-owned state root.
 * @returns A layer that closes workers before its durable stores.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { LocalEventService, localEventLayer } from "./provider.js";
 *
 * const program = Effect.gen(function* () {
 *   const events = yield* LocalEventService;
 *     yield* events.health();
 * });
 * await Effect.runPromise(program.pipe(Effect.provide(localEventLayer("/tmp/example-events"))));
 * ```
 */
export function localEventLayer(root: string) {
  return Layer.effect(LocalEventService, makeLocalEventService(root));
}

/**
 * Owns log, router, worker fibers and background failure state.
 * @param root - Provider-owned state root.
 * @returns The lazy acquisition requiring Scope for worker and store finalization.
 */
export const makeLocalEventService = Effect.fn("Events.open")(
  function* (root: string) {
    const scope = yield* Effect.scope;
    const log = yield* Effect.acquireRelease(
      localPromise(() => createEventLog(join(root, "log"))),
      (value) => localPromise(() => value.close()).pipe(Effect.orDie),
    );
    const router = yield* Effect.acquireRelease(
      localPromise(() => createEventRouter(join(root, "router"))),
      (value) => localPromise(() => value.close()).pipe(Effect.orDie),
    );
    const inspection = createEventAdmin(router, { mode: "production", enabled: false });
    const failure = yield* Ref.make<LocalOperationError | undefined>(undefined);
    const closed = yield* Ref.make(false);
    /**
     * Replays a supervised background failure to foreground provider operations.
     * @returns A lazy effect failing with the retained worker error when present.
     */
    const health = Effect.fn("Events.health")(function* () {
      const error = yield* Ref.get(failure);
      if (error !== undefined) return yield* Effect.fail(error);
    });
    /**
     * Forks ready durable delivery attempts into the provider scope and supervises failures.
     * @returns A lazy scheduling effect; the scope owns and joins the attempt fibers.
     */
    const tick = Effect.fn("Events.poll")(function* () {
      if ((yield* Ref.get(closed)) || (yield* Ref.get(failure)) !== undefined) return;
      const triggers = yield* localSync(() =>
        router.snapshot().triggers.filter((trigger) => trigger.delivery === "durable"),
      );
      yield* Effect.forEach(
        triggers,
        (trigger) =>
          // Handler callbacks have no cancellation channel. Join their native work before closing stores.
          localPromise(() => router.runNext(trigger.id)).pipe(
            Effect.uninterruptible,
            Effect.catch((error) => Ref.set(failure, error)),
            Effect.forkIn(scope),
          ),
        { discard: true },
      );
    });
    yield* tick().pipe(
      Effect.repeat(Schedule.spaced("100 millis")),
      Effect.catch((error) => Ref.set(failure, error)),
      Effect.forkScoped,
    );
    yield* Effect.addFinalizer(() => Ref.set(closed, true));
    /**
     * Appends a publication, acknowledges durable fanout, and schedules ready deliveries.
     * @param payload - Event payload to persist.
     * @param options - Publication identity and attribute settings.
     * @param context - Caller cancellation, deadline and scope metadata.
     * @returns A lazy effect yielding the accepted public event receipt.
     */
    const publish = Effect.fn("Events.publish")(
      function* (payload: unknown, options: EventPublishOptions, context: EventOperationContext) {
        if (yield* Ref.get(closed))
          return yield* localSync(() => {
            throw new Error("Event provider is closed");
          });
        yield* health();
        const timestamp = new Date(yield* Clock.currentTimeMillis).toISOString();
        const record = yield* localPromise(() =>
          log.append({
            instanceId: `event-${randomUUID()}`,
            eventId: context.eventId,
            version: context.version,
            payload,
            occurredAt: timestamp,
            publishedAt: timestamp,
            ...(options.key === undefined ? {} : { key: options.key }),
            ...(context.propagation === undefined ? {} : { propagation: context.propagation }),
            attributes: options.attributes ?? {},
          }),
        );
        const fanout = yield* localPromise(() => router.route(record, { run: false }));
        const failed = fanout.deliveries.find(
          (delivery) => delivery.delivery === "durable" && !delivery.accepted,
        );
        if (failed !== undefined)
          return yield* localSync(() => {
            throw failed.error ?? new Error("Event delivery could not be persisted");
          });
        yield* tick();
        return { accepted: true as const, ...record.envelope };
      },
      (effect) => localOperation("Events.publish", effect),
    );
    return LocalEventService.of({
      health,
      publish,
      query: (request: EventQueryRequest = {}) =>
        localOperation(
          "Events.query",
          localSync(() => inspection.query(request)),
        ),
      registerContract: (contract) =>
        localOperation(
          "Events.registerContract",
          localPromise(() => router.registerContract(contract)),
        ),
      registerTrigger: (binding) =>
        localOperation(
          "Events.registerTrigger",
          localPromise(() => router.registerTrigger(binding)),
        ),
    });
  },
  (effect) => localOperation("Events.open", effect),
);

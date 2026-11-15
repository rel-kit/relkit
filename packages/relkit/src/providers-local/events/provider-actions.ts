/**
 * Delivery administration the local event provider exposes to the Inspector's event actions:
 * `retry` of a dead-lettered delivery, `cancel` of a pending or scheduled one, and `replay` of a
 * publication, a new delivery of the same publication to its triggers (see `router-admin.ts`).
 * Each accepts the bare identifier or the action request that carries it, checks the state rule
 * the inspection API enforces (retry needs dead-lettered; cancel refuses completed, cancelled,
 * dead-lettered and running deliveries), and answers the delivery's status afterwards. The
 * provider's 100 ms poll runs the requeued or replayed deliveries.
 */
import { Effect } from "effect";
import { localOperation, localPromise, localSync } from "../local-effect.js";
import type { EventDeliveryContract } from "./admin-contracts.js";
import { EventAdminError } from "./admin-errors.js";
import { findDelivery } from "./admin-state.js";
import type { EventRouter } from "./router-types.js";
import type { EventReplayResult } from "./provider.types.js";

/** An identifier, or an action request carrying it under `key`. */
type Target<Key extends string> = string | { readonly [K in Key]?: string };

/**
 * Builds the provider's administration effects over its router.
 * @param router - The provider's event router.
 * @returns Lazy observed `retry`, `cancel` and `replay` operations.
 */
export function providerActions(router: EventRouter) {
  const status = (deliveryId: string) =>
    localSync(() => findDelivery(router.snapshot(), deliveryId));
  const administer = (
    name: "Events.retry" | "Events.cancel",
    target: Target<"deliveryId">,
    eligible: (delivery: EventDeliveryContract) => boolean,
    apply: (deliveryId: string) => Promise<unknown>,
  ) =>
    localOperation(
      name,
      Effect.gen(function* () {
        const deliveryId = yield* localSync(() => idOf(target, "deliveryId"));
        const before = yield* status(deliveryId);
        if (before === undefined)
          return yield* localSync(() => {
            throw new EventAdminError(
              "RELKIT_EVENT_ADMIN_NOT_FOUND",
              `Event delivery ${deliveryId} is unknown`,
            );
          });
        if (!eligible(before))
          return yield* localSync(() => {
            throw new EventAdminError(
              "RELKIT_EVENT_ADMIN_STATE_INELIGIBLE",
              `Event delivery ${deliveryId} is ${before.state}`,
            );
          });
        yield* localPromise(() => apply(deliveryId));
        return (yield* status(deliveryId)) ?? before;
      }),
    );
  return {
    retry: (target: Target<"deliveryId">) =>
      administer(
        "Events.retry",
        target,
        (delivery) => delivery.state === "dead-lettered",
        router.retry,
      ),
    cancel: (target: Target<"deliveryId">) =>
      administer(
        "Events.cancel",
        target,
        (delivery) => delivery.state === "available" || delivery.state === "delayed",
        router.cancel,
      ),
    replay: (target: Target<"publicationId">) =>
      localOperation(
        "Events.replay",
        Effect.gen(function* () {
          const publicationId = yield* localSync(() => idOf(target, "publicationId"));
          const fanout = yield* localPromise(() => router.replay(publicationId));
          return Object.freeze({
            replayOf: publicationId,
            eventId: fanout.event.eventId,
            version: fanout.event.version,
            instanceId: fanout.event.instanceId,
            publishedAt: fanout.event.publishedAt,
            deliveries: Object.freeze(
              fanout.deliveries.map((delivery) => ({
                triggerId: delivery.triggerId,
                ...(delivery.deliveryId === undefined ? {} : { deliveryId: delivery.deliveryId }),
              })),
            ),
          } satisfies EventReplayResult);
        }),
      ),
  };
}

/**
 * Reads the identifier of an action target.
 * @param target - Bare identifier or action request.
 * @param key - Field of the request that holds it.
 * @returns The identifier.
 * @throws {EventAdminError} When no identifier is given.
 */
function idOf<Key extends string>(target: Target<Key>, key: Key): string {
  const value = typeof target === "string" ? target : target?.[key];
  if (typeof value !== "string" || value.length === 0)
    throw new EventAdminError("RELKIT_EVENT_ADMIN_DELIVERY_INVALID", `Event ${key} is invalid`);
  return value;
}

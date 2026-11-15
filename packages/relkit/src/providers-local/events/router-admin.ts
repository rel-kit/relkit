/**
 * Development administration of the local event router beyond the dead-letter retry: cancelling
 * a delivery that has not run yet, and replaying a publication. A replay is a true re-delivery:
 * every trigger of the publication's event receives a new delivery of the SAME publication (same
 * instance id and payload) under a new delivery id marked as a replay, so the reaction runs with
 * the source `event-replay`; nothing is published again. Durable triggers accept the replay into
 * their queue, which the provider's poll runs; ephemeral triggers are invoked once, not awaited,
 * as their publication-time delivery is. The router spreads these into its public object.
 */
import type { UnknownEventEnvelope } from "../../events/index.js";
import type { EventLogRecord } from "./log.js";
import type { RegisteredTrigger } from "./router.types.js";
import type { EventDeliveryResult, EventRouter } from "./router-types.js";
import { EventRouterStateError, makeReplayDeliveryId } from "./router-records.js";

/**
 * Builds the router's cancel and replay operations over its registered triggers.
 * @param triggers - Registered triggers with their delivery owners.
 * @param publications - Publications routed by this router, oldest first.
 * @param ensureOpen - Throws when the router is closed.
 * @returns The `cancel` and `replay` members of {@link EventRouter}.
 */
export function routerAdmin(
  triggers: ReadonlyMap<string, RegisteredTrigger>,
  publications: readonly EventLogRecord[],
  ensureOpen: () => void,
): Pick<EventRouter, "cancel" | "replay"> {
  return {
    cancel: async (deliveryId) => {
      ensureOpen();
      for (const { binding, durable } of triggers.values())
        if (durable?.snapshot().records.some((record) => record.deliveryId === deliveryId))
          return Object.freeze({
            delivery: binding.delivery,
            ...(await durable.cancel(deliveryId)),
          });
      throw new EventRouterStateError(`Unknown event delivery ${deliveryId}`);
    },
    replay: async (publicationId) => {
      ensureOpen();
      const record = publications.find((entry) => entry.envelope.instanceId === publicationId);
      if (record === undefined)
        throw new EventRouterStateError(`Unknown event publication ${publicationId}`);
      const event = record.envelope;
      const token = crypto.randomUUID().replaceAll("-", "");
      const matching = [...triggers.values()]
        .filter(
          ({ binding }) =>
            binding.eventId === event.eventId && binding.eventVersion === event.version,
        )
        .sort((left, right) => left.binding.id.localeCompare(right.binding.id));
      const deliveries: EventDeliveryResult[] = [];
      for (const trigger of matching) deliveries.push(await replayTo(trigger, event, token));
      return Object.freeze({
        event,
        matchedTriggerIds: Object.freeze(matching.map(({ binding }) => binding.id)),
        deliveries: Object.freeze(deliveries),
      });
    },
  };
}

/**
 * Delivers a publication again to one trigger.
 * @param trigger - Registered trigger.
 * @param event - The stored publication envelope.
 * @param token - Token of this replay, shared by its deliveries.
 * @returns The accepted durable delivery, or the queued ephemeral invocation.
 */
async function replayTo(
  trigger: RegisteredTrigger,
  event: UnknownEventEnvelope,
  token: string,
): Promise<EventDeliveryResult> {
  const { binding, durable } = trigger;
  if (durable !== undefined)
    return Object.freeze({
      delivery: binding.delivery,
      ...(await durable.accept(event, makeReplayDeliveryId(event.instanceId, binding.id, token))),
    });
  // An ephemeral reaction is not awaited at publication either; its failure is its own record.
  void binding
    .invoke(event, {
      attempt: 1,
      replayed: true,
      ...(binding.timeoutMs === undefined ? {} : { timeoutMs: binding.timeoutMs }),
    })
    .catch(() => undefined);
  return Object.freeze({
    triggerId: binding.id,
    delivery: binding.delivery,
    accepted: true,
    persisted: false,
    status: "queued" as const,
  });
}

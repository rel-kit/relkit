import type { UnknownEventEnvelope } from "@relkit/events";
import type { EventDeliveryResult } from "./router-types.js";
import type { RegisteredTriggerView } from "./router-inspection.js";
import { EventRouterStateError } from "./router-records.js";

/** Routes one envelope to a trigger while preserving its actual durable/ephemeral acceptance semantics.
 * @param envelope - Validated event envelope.
 * @param trigger - Registered target with its durable or ephemeral delivery owner.
 * @param run - Whether the caller waits for handler execution instead of acceptance.
 * @returns The trigger-specific delivery result with actual persistence guarantees.
 */
export async function deliver(
  trigger: RegisteredTriggerView,
  envelope: UnknownEventEnvelope,
  run: boolean,
): Promise<EventDeliveryResult> {
  const { binding, durable, ephemeral } = trigger;
  if (binding.delivery === "ephemeral") {
    if (ephemeral === undefined)
      throw new EventRouterStateError("Ephemeral trigger has no delivery limiter");
    const delivery = ephemeral.deliver(envelope);
    if (!run) {
      void delivery;
      return {
        triggerId: binding.id,
        delivery: binding.delivery,
        accepted: true,
        persisted: false,
        status: "queued",
      };
    }
    return Object.freeze({
      triggerId: binding.id,
      delivery: binding.delivery,
      ...(await delivery),
    });
  }
  if (durable === undefined) {
    return {
      triggerId: binding.id,
      delivery: binding.delivery,
      accepted: false,
      persisted: false,
      status: "failed",
      error: new EventRouterStateError("Durable trigger has no delivery"),
    };
  }
  try {
    const result = run ? await durable.deliver(envelope) : await durable.accept(envelope);
    return Object.freeze({ delivery: binding.delivery, ...result });
  } catch (error) {
    return Object.freeze({
      triggerId: binding.id,
      delivery: binding.delivery,
      accepted: false,
      persisted: false,
      status: "failed" as const,
      error,
    });
  }
}

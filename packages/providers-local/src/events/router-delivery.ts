import type { UnknownEventEnvelope } from "@relkit/events";
import type { EventDeliveryResult } from "./router-types.js";
import type { RegisteredTriggerView } from "./router-inspection.js";
import { EventRouterStateError } from "./router-records.js";

export async function deliver(
  { binding, durable, ephemeral }: RegisteredTriggerView,
  envelope: UnknownEventEnvelope,
  run: boolean,
): Promise<EventDeliveryResult> {
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

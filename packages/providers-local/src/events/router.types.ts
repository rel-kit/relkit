import type { EphemeralDelivery } from "./ephemeral.js";
import type { RegisteredTriggerView } from "./router-inspection.js";

/** Router-owned trigger binding and its durable or ephemeral delivery owner. */
export type RegisteredTrigger = RegisteredTriggerView & { readonly ephemeral?: EphemeralDelivery };

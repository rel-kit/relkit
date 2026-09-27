/** Minimal function descriptor accepted by event contract binding.
 * @example const target: FunctionWithEvents = { id: "orders.create", publishes: ["orders.created"] }
 */
export interface FunctionWithEvents {
  readonly id: string;
  readonly invocationMode?: "callable" | "event-only";
  readonly event?: string;
  readonly publishes?: readonly string[];
  readonly input?: unknown;
}
export type { EventDescriptorAny } from "./define-event.types.js";

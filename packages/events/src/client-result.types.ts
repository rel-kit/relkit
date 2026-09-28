/** Substitutable clock and identifier source for event envelopes.
 * @example const identity: EventIdentityService = { now: () => new Date(0), nextId: () => "event-1" }
 */
export interface EventIdentityService {
  /** Reads the current wall-clock time.
   * @returns The current date.
   * @example identity.now()
   */
  readonly now: () => Date;
  /** Generates a unique event instance ID.
   * @returns An opaque instance ID.
   * @example identity.nextId()
   */
  readonly nextId: () => string;
}
export type { EventPublishOptions, EventPublishResult } from "@relkit/functions";
export type { EventOperationContext, EventProviderResult } from "./client.types.js";

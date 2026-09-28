import type { MaybePromise, OperationId } from "@relkit/contracts";
import type { ChannelDescriptorData } from "./channel.types.js";
import type { PresenceSnapshot, TriggerReceipt } from "./types.js";
/** Options attached to a channel trigger request.
 * @example const options: ChannelTriggerOptions = { idempotencyKey: id };
 */
export interface ChannelTriggerOptions {
  readonly idempotencyKey?: OperationId;
}
/** A generation-bound dispatcher for validated realtime operations.
 * @example const dispatcher: RealtimeDispatcher = { trigger: async () => receipt, getPresence: async () => presence };
 */
export interface RealtimeDispatcher {
  /** Publishes a validated event.
   * @param request - Channel, parameters, event, payload, and optional idempotency key.
   * @param signal - Optional cancellation signal for in-flight work.
   * @returns A trigger receipt or a provider rejection.
   * @example await dispatcher.trigger({ channel, params: {}, event: "posted", payload: "hello" });
   */
  readonly trigger: (
    request: {
      readonly channel: ChannelDescriptorData;
      readonly params: unknown;
      readonly event: string;
      readonly payload: unknown;
      readonly options?: ChannelTriggerOptions;
    },
    signal?: AbortSignal,
  ) => MaybePromise<TriggerReceipt>;
  /** Reads the current presence snapshot.
   * @param request - Channel and validated parameters.
   * @param signal - Optional cancellation signal for in-flight work.
   * @returns Presence snapshot or a provider rejection.
   * @example await dispatcher.getPresence({ channel, params: {} });
   */
  readonly getPresence: (
    request: {
      readonly channel: ChannelDescriptorData;
      readonly params: unknown;
    },
    signal?: AbortSignal,
  ) => MaybePromise<PresenceSnapshot>;
}

import { Effect, Result } from "effect";
import type { ChannelDescriptorData } from "./channel.types.js";
import { currentRealtimeDispatcherEffect } from "./dispatch.js";
import type { ChannelTriggerOptions } from "./dispatch.types.js";
import { validateChannelValueEffect } from "./channel-validation.js";
import {
  ChannelValidationError,
  RealtimeDispatcherError,
  RealtimeProviderError,
} from "./realtime-errors.js";
import { observeRealtime } from "./realtime-observability.js";
/** Converts an Effect result to the legacy Promise rejection shape.
 * @param effect - Channel operation to run.
 * @returns The successful value.
 * @throws TypeError, Error, or the original provider rejection on failure.
 * @example await runChannelPromise(triggerChannelEffect(channel, {}, "posted", "hello"));
 */
export async function runChannelPromise<A, E>(effect: Effect.Effect<A, E>): Promise<A> {
  const result = await Effect.runPromise(Effect.result(effect));
  if (Result.isFailure(result)) {
    const error = result.failure;
    if (error instanceof ChannelValidationError) {
      if ("cause" in error) throw error.cause;
      throw new TypeError(error.reason);
    }
    if (error instanceof RealtimeDispatcherError) throw new Error(error.reason);
    if (error instanceof RealtimeProviderError) throw error.cause;
    throw error;
  }
  return result.success;
}
/** Validates and dispatches one channel event in the Effect path.
 * @param channel - Validated channel descriptor.
 * @param params - Channel parameters.
 * @param event - Event name.
 * @param payload - Event payload.
 * @param options - Optional idempotency data.
 * @returns An Effect of the provider receipt or a tagged validation, dispatcher, or provider error.
 * @example Effect.runPromise(triggerChannelEffect(channel, {}, "posted", "hello"));
 */
export const triggerChannelEffect = Effect.fn("Realtime.triggerChannel")(
  function* (
    channel: ChannelDescriptorData,
    params: unknown,
    event: string,
    payload: unknown,
    options?: ChannelTriggerOptions,
  ) {
    const validatedParams = yield* validateChannelValueEffect(channel.params, params, "params");
    const eventSchema = channel.events[event];
    if (eventSchema === undefined)
      return yield* Effect.fail(
        new ChannelValidationError({
          operation: "channel.trigger",
          reason: `Unknown channel event "${event}"`,
        }),
      );
    const validatedPayload = yield* validateChannelValueEffect(eventSchema, payload, "payload");
    const dispatcher = yield* currentRealtimeDispatcherEffect();
    return yield* Effect.tryPromise({
      try: (signal) =>
        Promise.resolve(
          dispatcher.trigger(
            {
              channel,
              params: validatedParams,
              event,
              payload: validatedPayload,
              ...(options === undefined ? {} : { options }),
            },
            signal,
          ),
        ),
      catch: (cause) => new RealtimeProviderError({ operation: "channel.trigger", cause }),
    });
  },
  (effect) => observeRealtime("channel.trigger", effect),
);
/** Reads a channel's presence snapshot in the Effect path.
 * @param channel - Validated channel descriptor.
 * @param params - Channel parameters.
 * @returns An Effect of presence or a tagged validation, dispatcher, or provider error.
 * @example Effect.runPromise(getChannelPresenceEffect(channel, {}));
 */
export const getChannelPresenceEffect = Effect.fn("Realtime.getChannelPresence")(
  function* (channel: ChannelDescriptorData, params: unknown) {
    const validatedParams = yield* validateChannelValueEffect(channel.params, params, "params");
    const dispatcher = yield* currentRealtimeDispatcherEffect();
    return yield* Effect.tryPromise({
      try: (signal) =>
        Promise.resolve(dispatcher.getPresence({ channel, params: validatedParams }, signal)),
      catch: (cause) => new RealtimeProviderError({ operation: "channel.getPresence", cause }),
    });
  },
  (effect) => observeRealtime("channel.getPresence", effect),
);

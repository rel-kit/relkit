import { createDescriptorBase, deepFreeze, isDescriptor, normalizeId } from "@relkit/contracts";
import type { InferOutput, StandardSchemaV1 } from "@relkit/schema";
import { Effect, Result } from "effect";
import type {
  ChannelClientPolicy,
  ChannelDescriptor,
  ChannelDescriptorAny,
  ChannelGuard,
  ChannelPresence,
  DefineChannelOptions,
} from "./channel.types.js";
import {
  assertChannelSchemaEffect,
  copyChannelEventsEffect,
  isChannelSchemaEffect,
  isRecordEffect,
} from "./channel-validation.js";
import {
  copyChannelClientEffect,
  copyChannelPresenceEffect,
  copyChannelReplayEffect,
} from "./channel-policy.js";
import { ChannelValidationError } from "./realtime-errors.js";
import { observeRealtime } from "./realtime-observability.js";
import {
  getChannelPresenceEffect,
  runChannelPromise,
  triggerChannelEffect,
} from "./channel-operations.js";
import type { ChannelTriggerOptions } from "./dispatch.types.js";
export type * from "./channel.types.js";
export { getChannelPresenceEffect, triggerChannelEffect };
/** Constructs a typed channel descriptor through validated Effect operations.
 * @param options - Authored channel options.
 * @returns An Effect of the frozen descriptor or ChannelValidationError.
 * @example Effect.runSync(defineChannelEffect({ id: "news", params: schema, events: { posted: schema } }));
 */
export const defineChannelEffect = Effect.fn("Realtime.defineChannel")(
  function* <
    const Id extends string,
    const ParamsSchema extends StandardSchemaV1,
    const Events extends Readonly<Record<string, StandardSchemaV1>>,
    const Client extends ChannelClientPolicy<ChannelGuard<InferOutput<ParamsSchema>>> | undefined,
    const Presence extends ChannelPresence<InferOutput<ParamsSchema>> | undefined = undefined,
  >(options: DefineChannelOptions<Id, ParamsSchema, Events, Client, Presence>) {
    if (!(yield* isRecordEffect(options)))
      return yield* Effect.fail(
        new ChannelValidationError({
          operation: "channel.define",
          reason: "Channel options must be an object",
        }),
      );
    yield* assertChannelSchemaEffect(options.params, "params");
    const events = yield* copyChannelEventsEffect(options.events);
    const client = yield* copyChannelClientEffect(options.client);
    const presence = yield* copyChannelPresenceEffect(options.presence, client);
    if (Reflect.ownKeys(events).length === 0 && presence === undefined)
      return yield* Effect.fail(
        new ChannelValidationError({
          operation: "channel.define",
          reason: "A channel without events must declare presence",
        }),
      );
    const profile =
      options.profile === undefined
        ? undefined
        : yield* Effect.try({
            try: () => normalizeId(options.profile as string),
            catch: (error) =>
              new ChannelValidationError({
                operation: "channel.define",
                reason: error instanceof Error ? error.message : "Invalid profile",
              }),
          });
    const replay = yield* copyChannelReplayEffect(options.replay);
    const descriptor = yield* Effect.try({
      try: () => ({
        ...createDescriptorBase("channel", options.id, options),
        params: options.params,
        events,
        ...(profile === undefined ? {} : { profile }),
        ...(client === undefined ? {} : { client }),
        ...(replay === undefined ? {} : { replay }),
        ...(presence === undefined ? {} : { presence }),
      }),
      catch: (error) =>
        new ChannelValidationError({
          operation: "channel.define",
          reason: error instanceof Error ? error.message : "Invalid channel descriptor",
        }),
    });
    Object.defineProperty(descriptor, "trigger", {
      enumerable: false,
      value: (
        params: unknown,
        event: string,
        payload: unknown,
        triggerOptions?: ChannelTriggerOptions,
      ) =>
        runChannelPromise(triggerChannelEffect(descriptor, params, event, payload, triggerOptions)),
    });
    if (presence !== undefined)
      Object.defineProperty(descriptor, "getPresence", {
        enumerable: false,
        value: (params: unknown) => runChannelPromise(getChannelPresenceEffect(descriptor, params)),
      });
    return deepFreeze(descriptor) as unknown as ChannelDescriptor<
      Id,
      ParamsSchema,
      Events,
      Client,
      Presence
    >;
  },
  (effect) => observeRealtime("channel.define", effect),
);
/** Defines a typed channel for validated backend publication and observation.
 * @param options - Authored schema, event, policy, and presence options.
 * @returns A frozen channel descriptor.
 * @throws TypeError for invalid channel options.
 * @example const alerts = defineChannel({ id: "alerts", params: z.object({}), events: { posted: z.string() } });
 * @category Realtime
 * @since 0.4.0
 */
export function defineChannel<
  const Id extends string,
  const ParamsSchema extends StandardSchemaV1,
  const Events extends Readonly<Record<string, StandardSchemaV1>>,
  const Client extends ChannelClientPolicy<ChannelGuard<InferOutput<ParamsSchema>>> | undefined,
  const Presence extends ChannelPresence<InferOutput<ParamsSchema>> | undefined = undefined,
>(
  options: DefineChannelOptions<Id, ParamsSchema, Events, Client, Presence>,
): ChannelDescriptor<Id, ParamsSchema, Events, Client, Presence> {
  const result = Effect.runSync(Effect.result(defineChannelEffect(options)));
  if (Result.isFailure(result)) throw new TypeError(result.failure.reason);
  return result.success;
}
/** Checks for a channel descriptor in the Effect path.
 * @param value - Candidate descriptor.
 * @returns An Effect of a boolean with no typed error.
 * @example Effect.runSync(isChannelDescriptorEffect(channel));
 */
export const isChannelDescriptorEffect = Effect.fn("Realtime.isChannelDescriptor")(
  function* (value: unknown) {
    if (!isDescriptor(value, "channel") || !(yield* isRecordEffect(value))) return false;
    return yield* isChannelSchemaEffect((value as unknown as Record<PropertyKey, unknown>).params);
  },
  (effect) => observeRealtime("channel.isDescriptor", effect),
);
/** Checks for a channel descriptor.
 * @param value - Candidate descriptor.
 * @returns Whether the value is a channel descriptor.
 * @example isChannelDescriptor(channel);
 */
export function isChannelDescriptor(value: unknown): value is ChannelDescriptorAny {
  return Effect.runSync(isChannelDescriptorEffect(value));
}

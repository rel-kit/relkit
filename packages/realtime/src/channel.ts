import {
  createDescriptorBase,
  deepFreeze,
  isDescriptor,
  normalizeId,
  type DescriptorBase,
  type DescriptorMetadata,
  type MaybePromise,
} from "@relkit/contracts";
import type { InferInput, InferOutput, StandardSchemaV1 } from "@relkit/schema";
import type { OperationId } from "@relkit/contracts";
import type { MemberPresence, CountPresence, TriggerReceipt } from "./types.js";
import { currentRealtimeDispatcher } from "./dispatch.js";
import {
  assertChannelSchema,
  copyChannelClient,
  copyChannelEvents,
  copyChannelPresence,
  copyChannelReplay,
  isChannelSchema,
  isRecord,
  validateChannelValue,
} from "./channel-validation.js";

export type ChannelGuard<Params = unknown, Context = unknown> = (
  params: Params,
  context: Context,
) => MaybePromise<boolean>;

export type ChannelClientPolicy<Guard> =
  | { readonly public: true; readonly authorize?: never }
  | { readonly authorize: Guard; readonly public?: never };

export interface MemberPresenceDescriptor<
  MemberSchema extends StandardSchemaV1 = StandardSchemaV1,
  Params = unknown,
  Context = unknown,
> {
  readonly member: MemberSchema;
  readonly resolve: (params: Params, context: Context) => MaybePromise<InferInput<MemberSchema>>;
  readonly maxMembers: number;
}

export type ChannelPresence<Params = unknown, Context = unknown> =
  "count" | MemberPresenceDescriptor<StandardSchemaV1, Params, Context>;

export interface ChannelReplay {
  readonly retentionMs: number;
  readonly maxEvents: number;
}

export type ChannelDescriptor<
  Id extends string,
  ParamsSchema extends StandardSchemaV1,
  Events extends Readonly<Record<string, StandardSchemaV1>>,
  Client extends ChannelClientPolicy<ChannelGuard<InferOutput<ParamsSchema>>> | undefined,
  Presence extends ChannelPresence<InferOutput<ParamsSchema>> | undefined,
> = DescriptorBase<"channel", Id> & {
  readonly params: ParamsSchema;
  readonly events: Events;
  readonly profile?: string;
  readonly client?: Client;
  readonly replay?: ChannelReplay;
  readonly presence?: Presence;
  readonly trigger: <Name extends Extract<keyof Events, string>>(
    params: InferInput<ParamsSchema>,
    event: Name,
    payload: InferInput<Events[Name]>,
    options?: { readonly idempotencyKey?: OperationId },
  ) => Promise<TriggerReceipt>;
} & ([Presence] extends [undefined]
    ? {}
    : {
        readonly getPresence: (
          params: InferInput<ParamsSchema>,
        ) => Promise<PresenceResult<Presence>>;
      });

type PresenceResult<Presence> = Presence extends "count"
  ? CountPresence
  : Presence extends MemberPresenceDescriptor<infer Schema>
    ? MemberPresence<InferOutput<Schema>>
    : never;

export type ChannelDescriptorAny = ChannelDescriptor<
  string,
  StandardSchemaV1,
  Readonly<Record<string, StandardSchemaV1>>,
  ChannelClientPolicy<ChannelGuard> | undefined,
  ChannelPresence | undefined
>;

export interface DefineChannelOptions<
  Id extends string,
  ParamsSchema extends StandardSchemaV1,
  Events extends Readonly<Record<string, StandardSchemaV1>>,
  Client extends ChannelClientPolicy<ChannelGuard<InferOutput<ParamsSchema>>> | undefined,
  Presence extends ChannelPresence<InferOutput<ParamsSchema>> | undefined,
> extends DescriptorMetadata {
  readonly id: Id;
  readonly params: ParamsSchema;
  readonly events: Events;
  readonly profile?: string;
  readonly client?: Client;
  readonly replay?: ChannelReplay;
  readonly presence?: Presence;
}

/**
 * Defines a typed channel for validated backend publication and observation.
 * @example
 * ```ts
 * import { defineChannel } from "@relkit/realtime"
 * import { z } from "@relkit/schema"
 * const alerts = defineChannel({ id: "alerts", params: z.object({}), events: { posted: z.string() }, client: { public: true } })
 * ```
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
  if (!isRecord(options)) throw new TypeError("Channel options must be an object");
  assertChannelSchema(options.params, "params");
  const events = copyChannelEvents(options.events);
  const client = copyChannelClient(options.client);
  const presence = copyChannelPresence(options.presence, client);
  if (Reflect.ownKeys(events).length === 0 && presence === undefined) {
    throw new TypeError("A channel without events must declare presence");
  }
  const profile = options.profile === undefined ? undefined : normalizeId(options.profile);
  const replay = copyChannelReplay(options.replay);
  const descriptor = {
    ...createDescriptorBase("channel", options.id, options),
    params: options.params,
    events,
    ...(profile === undefined ? {} : { profile }),
    ...(client === undefined ? {} : { client }),
    ...(replay === undefined ? {} : { replay }),
    ...(presence === undefined ? {} : { presence }),
  } as Record<PropertyKey, unknown>;
  Object.defineProperty(descriptor, "trigger", {
    enumerable: false,
    value: async (params: unknown, event: string, payload: unknown, triggerOptions?: unknown) => {
      const validatedParams = await validateChannelValue(options.params, params, "params");
      const eventSchema = events[event];
      if (eventSchema === undefined) throw new TypeError(`Unknown channel event "${event}"`);
      const validatedPayload = await validateChannelValue(eventSchema, payload, "payload");
      return currentRealtimeDispatcher().trigger({
        channel: descriptor as unknown as ChannelDescriptorAny,
        params: validatedParams,
        event,
        payload: validatedPayload,
        ...(triggerOptions === undefined ? {} : { options: triggerOptions as never }),
      });
    },
  });
  if (presence !== undefined) {
    Object.defineProperty(descriptor, "getPresence", {
      enumerable: false,
      value: async (params: unknown) =>
        currentRealtimeDispatcher().getPresence({
          channel: descriptor as unknown as ChannelDescriptorAny,
          params: await validateChannelValue(options.params, params, "params"),
        }),
    });
  }
  return deepFreeze(descriptor) as unknown as ChannelDescriptor<
    Id,
    ParamsSchema,
    Events,
    Client,
    Presence
  >;
}

export function isChannelDescriptor(value: unknown): value is ChannelDescriptorAny {
  return isDescriptor(value, "channel") && isRecord(value) && isChannelSchema(value.params);
}

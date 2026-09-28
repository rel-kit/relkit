import type {
  DescriptorBase,
  DescriptorMetadata,
  MaybePromise,
  OperationId,
} from "@relkit/contracts";
import type { InferInput, InferOutput, StandardSchemaV1 } from "@relkit/schema";
import type { CountPresence, MemberPresence, TriggerReceipt } from "./types.js";
/** Authorizes channel parameters against an application context.
 * @example const allow: ChannelGuard = async () => true;
 */
export type ChannelGuard<Params = unknown, Context = unknown> = (
  params: Params,
  context: Context,
) => MaybePromise<boolean>;
/** Public access or an authorization guard, exclusively.
 * @example const policy: ChannelClientPolicy<ChannelGuard> = { public: true };
 */
export type ChannelClientPolicy<Guard> =
  | { readonly public: true; readonly authorize?: never }
  | { readonly authorize: Guard; readonly public?: never };
/** Describes validated member presence for a protected channel.
 * @example const presence: MemberPresenceDescriptor<typeof schema> = { member: schema, resolve: async () => ({ name: "Ada" }), maxMembers: 10 };
 */
export interface MemberPresenceDescriptor<
  MemberSchema extends StandardSchemaV1 = StandardSchemaV1,
  Params = unknown,
  Context = unknown,
> {
  readonly member: MemberSchema;
  readonly resolve: (params: Params, context: Context) => MaybePromise<InferInput<MemberSchema>>;
  readonly maxMembers: number;
}
/** Count-only or protected member presence.
 * @example const presence: ChannelPresence = "count";
 */
export type ChannelPresence<Params = unknown, Context = unknown> =
  "count" | MemberPresenceDescriptor<StandardSchemaV1, Params, Context>;
/** Retention settings copied into a channel descriptor.
 * @example const replay: ChannelReplay = { retentionMs: 60000, maxEvents: 100 };
 */
export interface ChannelReplay {
  readonly retentionMs: number;
  readonly maxEvents: number;
}
/** A typed channel descriptor with backend publication methods.
 * @example const channel: ChannelDescriptorAny = defineChannel(options);
 */
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
  /** Validates and publishes one event through the bound dispatcher.
   * @param params - Schema input for channel parameters.
   * @param event - One of the declared event names.
   * @param payload - Input for the selected event schema.
   * @param options - Optional idempotency key.
   * @returns A trigger receipt or validation/provider rejection.
   * @example await channel.trigger({ orderId: "o1" }, "changed", { status: "paid" });
   */
  readonly trigger: <Name extends Extract<keyof Events, string>>(
    params: InferInput<ParamsSchema>,
    event: Name,
    payload: InferInput<Events[Name]>,
    options?: { readonly idempotencyKey?: OperationId },
  ) => Promise<TriggerReceipt>;
} & ([Presence] extends [undefined]
    ? {}
    : {
        /** Reads validated presence through the bound dispatcher.
         * @param params - Schema input for channel parameters.
         * @returns Count or member presence, or a validation/provider rejection.
         * @example await channel.getPresence({ orderId: "o1" });
         */
        readonly getPresence: (
          params: InferInput<ParamsSchema>,
        ) => Promise<PresenceResult<Presence>>;
      });
/** Maps a presence policy to its observable result. */
type PresenceResult<Presence> = Presence extends "count"
  ? CountPresence
  : Presence extends MemberPresenceDescriptor<infer Schema>
    ? MemberPresence<InferOutput<Schema>>
    : never;
/** Erased descriptor type retained for existing public API consumers.
 * @example const channel: ChannelDescriptorAny = registry.get("news");
 */
export type ChannelDescriptorAny = ChannelDescriptor<
  string,
  StandardSchemaV1,
  Readonly<Record<string, StandardSchemaV1>>,
  ChannelClientPolicy<ChannelGuard> | undefined,
  ChannelPresence | undefined
>;
/** Descriptor data read by provider and transport boundaries.
 * Typed trigger methods remain on ChannelDescriptor; providers read only this data.
 * @example const data: ChannelDescriptorData = defineChannel(options);
 */
export type ChannelDescriptorData = DescriptorBase<"channel", string> & {
  readonly params: StandardSchemaV1;
  readonly events: Readonly<Record<string, StandardSchemaV1>>;
  readonly profile?: string;
  readonly client?: ChannelClientPolicy<ChannelGuard>;
  readonly replay?: ChannelReplay;
  readonly presence?: ChannelPresence;
};
/** Authored channel options before validation and normalization.
 * @example const options: DefineChannelOptions<"news", typeof schema, { posted: typeof schema }, undefined, undefined> = { id: "news", params: schema, events: { posted: schema } };
 */
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

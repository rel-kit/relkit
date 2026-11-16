import type {
  DescriptorBase,
  DescriptorMetadata,
  MaybePromise,
  OperationId,
  ProviderProfileName,
} from "../contracts/index.js";
import type { InferInput, InferOutput, StandardSchemaV1 } from "../schema/index.js";
import type { CountPresence, MemberPresence, TriggerReceipt } from "./types.js";
/** Authorizes channel parameters against an application context.
 * @example const allow: ChannelGuard = async () => true;
 * @experimental
 */
export type ChannelGuard<Params = unknown, Context = unknown> = (
  params: Params,
  context: Context,
) => MaybePromise<boolean>;
/** Public access or an authorization guard, exclusively.
 * @example const policy: ChannelClientPolicy<ChannelGuard> = { public: true };
 * @experimental
 */
export type ChannelClientPolicy<Guard> =
  | {
      /** Lets any client that can reach the application subscribe. */
      readonly public: true;
      readonly authorize?: never;
    }
  | {
      /** Decides on the server whether the caller may subscribe to the given partition. */
      readonly authorize: Guard;
      readonly public?: never;
    };
/** Describes validated member presence for a protected channel.
 * @example const presence: MemberPresenceDescriptor<typeof schema> = { member: schema, resolve: async () => ({ name: "Ada" }), maxMembers: 10 };
 * @experimental
 */
export interface MemberPresenceDescriptor<
  MemberSchema extends StandardSchemaV1 = StandardSchemaV1,
  Params = unknown,
  Context = unknown,
> {
  /** Schema of the public information shown for each connected member. */
  readonly member: MemberSchema;
  /** Builds that information for a caller from the channel params and the server context. */
  readonly resolve: (params: Params, context: Context) => MaybePromise<InferInput<MemberSchema>>;
  /** Most members returned in a presence list; it does not limit connections. */
  readonly maxMembers: number;
}
/** Count-only or protected member presence.
 * @example const presence: ChannelPresence = "count";
 * @experimental
 */
export type ChannelPresence<Params = unknown, Context = unknown> =
  "count" | MemberPresenceDescriptor<StandardSchemaV1, Params, Context>;
/** Retention settings copied into a channel descriptor.
 * @example const replay: ChannelReplay = { retentionMs: 60000, maxEvents: 100 };
 * @experimental
 */
export interface ChannelReplay {
  /** Longest age of an event that can be replayed, in milliseconds. */
  readonly retentionMs: number;
  /** Most events kept for one partition of the channel. */
  readonly maxEvents: number;
}
/** A typed channel descriptor; functions reach it through `dependencies.channels`.
 * @example const channel: ChannelDescriptorAny = defineChannel(options);
 * @experimental
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
};
/** Erased descriptor type retained for existing public API consumers.
 * @example const channel: ChannelDescriptorAny = registry.get("news");
 * @experimental
 */
export type ChannelDescriptorAny = ChannelDescriptor<
  string,
  StandardSchemaV1,
  Readonly<Record<string, StandardSchemaV1>>,
  ChannelClientPolicy<ChannelGuard> | undefined,
  ChannelPresence | undefined
>;
/** Descriptor data read by provider and transport boundaries.
 * @example const data: ChannelDescriptorData = defineChannel(options);
 * @experimental
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
 * @experimental
 */
export interface DefineChannelOptions<
  Id extends string,
  ParamsSchema extends StandardSchemaV1,
  Events extends Readonly<Record<string, StandardSchemaV1>>,
  Client extends ChannelClientPolicy<ChannelGuard<InferOutput<ParamsSchema>>> | undefined,
  Presence extends ChannelPresence<InferOutput<ParamsSchema>> | undefined,
> extends DescriptorMetadata {
  /** Stable channel name used by the backend and the generated client. */
  readonly id: Id;
  /** Schema of the values that identify one partition of the channel, such as an `orderId`. */
  readonly params: ParamsSchema;
  /** Event names mapped to the schemas of their payloads. */
  readonly events: Events;
  /** The realtime provider profile that carries the channel; the application's default when omitted. */
  readonly profile?: ProviderProfileName<"realtime">;
  /** Browser access: omit for backend-only use, or set `public: true` or an `authorize` guard. */
  readonly client?: Client;
  /** Keeps recent events so that a reconnecting client receives the ones it missed. */
  readonly replay?: ChannelReplay;
  /** Reports who is connected: `"count"` for a connection count, or a member description. */
  readonly presence?: Presence;
}

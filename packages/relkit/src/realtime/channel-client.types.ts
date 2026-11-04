import type { OperationId } from "../contracts/index.js";
import type { InferInput, InferOutput, StandardSchemaV1 } from "../schema/index.js";
import type { MemberPresenceDescriptor } from "./channel.types.js";
import type { CountPresence, MemberPresence, TriggerReceipt } from "./types.js";

type ParamsOf<T> = T extends { readonly params: infer S }
  ? S extends StandardSchemaV1
    ? InferInput<S>
    : never
  : never;
type EventsOf<T> = T extends { readonly events: infer E }
  ? E extends Readonly<Record<string, StandardSchemaV1>>
    ? E
    : never
  : never;
type PresenceOf<T> = T extends { readonly presence?: infer P } ? P : undefined;
type PresenceResult<Presence> = Presence extends "count"
  ? CountPresence
  : Presence extends MemberPresenceDescriptor<infer Schema>
    ? MemberPresence<InferOutput<Schema>>
    : never;

/** Typed client for a channel declared under `dependencies.channels`.
 * @example await context.channels.orderUpdates.trigger({ orderId }, "changed", { status });
 * @experimental
 */
export type ChannelClientFor<T> = {
  /** Validates and publishes one event through the application's realtime provider.
   * @param params - Channel parameters.
   * @param event - One of the declared event names.
   * @param payload - Input for the selected event schema.
   * @param options - Optional idempotency key.
   * @returns A trigger receipt or validation/provider rejection.
   * @example await context.channels.orderUpdates.trigger({ orderId }, "changed", { status });
   */
  readonly trigger: <Name extends Extract<keyof EventsOf<T>, string>>(
    params: ParamsOf<T>,
    event: Name,
    payload: InferInput<EventsOf<T>[Name]>,
    options?: { readonly idempotencyKey?: OperationId },
  ) => Promise<TriggerReceipt>;
} & ([NonNullable<PresenceOf<T>>] extends [never]
  ? {}
  : {
      /** Reads validated presence through the application's realtime provider.
       * @param params - Channel parameters.
       * @returns Count or member presence.
       * @example await context.channels.orderUpdates.getPresence({ orderId });
       */
      readonly getPresence: (
        params: ParamsOf<T>,
      ) => Promise<PresenceResult<NonNullable<PresenceOf<T>>>>;
    });

/** Named channel clients projected from dependencies.
 * @example const channels: ChannelClients<typeof dependencies.channels> = context.channels;
 * @experimental
 */
export type ChannelClients<M> = {
  readonly [Name in keyof NonNullable<M> & string]: ChannelClientFor<NonNullable<M>[Name]>;
};

import type { ChannelCheckpoint } from "@relkit/realtime";
import type { RealtimeFrame, RealtimeStatus } from "./realtime-manager.js";
import type { ChannelRegistry } from "./registry.js";
import type { ChannelSelector } from "./registry.types.js";

/**
 * The channel registry entry inferred from its declared name.
 * @typeParam Name - Declared registry key selecting the matching application contract.
 */
export type ChannelFor<Name extends ChannelSelector> = ChannelRegistry[Name];

/**
 * Channel parameter input inferred from the declared channel.
 * @typeParam Name - Declared registry key selecting the matching application contract.
 */
export type ParamsFor<Name extends ChannelSelector> =
  ChannelFor<Name> extends { readonly params: infer Params } ? Params : never;

/**
 * Event payloads inferred from the declared channel.
 * @typeParam Name - Declared registry key selecting the matching application contract.
 */
export type EventsFor<Name extends ChannelSelector> =
  ChannelFor<Name> extends { readonly events: infer Events } ? Events : never;

/**
 * Presence state inferred from the declared channel.
 * @typeParam Name - Declared registry key selecting the matching application contract.
 */
export type PresenceFor<Name extends ChannelSelector> =
  ChannelFor<Name> extends { readonly presence: infer Presence } ? Presence : never;

/** Realtime connection state with explicit channel observer controls. */
export interface UseRealtimeResult {
  readonly status: RealtimeStatus;
  readonly subscribe: <Name extends ChannelSelector>(
    name: Name,
    params: ParamsFor<Name>,
    listener: (frame: RealtimeFrame) => void,
  ) => () => void;
  readonly bind: UseRealtimeResult["subscribe"];
  readonly unbind: (unsubscribe: () => void) => void;
  readonly unsubscribe: (unsubscribe: () => void) => void;
}

/**
 * Typed handlers keyed by the declared channel's event names.
 * @typeParam Name - Declared registry key selecting the matching application contract.
 */
export type ChannelHandlers<Name extends ChannelSelector> = Partial<{
  readonly [Event in keyof EventsFor<Name>]: (payload: EventsFor<Name>[Event]) => void;
}>;

/**
 * Channel parameters and current-view event handlers.
 * @typeParam Name - Declared registry key selecting the matching application contract.
 */
export interface UseChannelOptions<Name extends ChannelSelector> {
  readonly params: ParamsFor<Name>;
  readonly on?: ChannelHandlers<Name>;
  readonly onCaughtUp?: () => void | Promise<void>;
  readonly onGap?: (reason: string) => void | Promise<void>;
}

/** Current checkpoint, connection status, events and presence projection. */
export interface ChannelState {
  readonly status: RealtimeStatus;
  readonly checkpoint?: ChannelCheckpoint;
  readonly caughtUp: boolean;
  readonly gap?: string;
  readonly presence?: unknown;
}

/**
 * Typed channel projection and explicit realtime controls.
 * @typeParam Name - Declared registry key selecting the matching application contract.
 */
export type UseChannelResult<Name extends ChannelSelector> = Omit<ChannelState, "presence"> &
  ([PresenceFor<Name>] extends [never] ? {} : { readonly presence: PresenceFor<Name> });

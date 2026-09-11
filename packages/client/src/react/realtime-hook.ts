"use client";

import type { ChannelCheckpoint } from "@relkit/realtime";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRelkitClient } from "./context.js";
import {
  realtimeSubscriptionKey,
  type RealtimeFrame,
  type RealtimeStatus,
} from "./realtime-manager.js";
import type { ChannelRegistry, ChannelSelector } from "./registry.js";

type ChannelFor<Name extends ChannelSelector> = ChannelRegistry[Name];
type ParamsFor<Name extends ChannelSelector> =
  ChannelFor<Name> extends { readonly params: infer Params } ? Params : never;
type EventsFor<Name extends ChannelSelector> =
  ChannelFor<Name> extends { readonly events: infer Events } ? Events : never;
type PresenceFor<Name extends ChannelSelector> =
  ChannelFor<Name> extends { readonly presence: infer Presence } ? Presence : never;

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

export function useRealtime(): UseRealtimeResult {
  const { realtime } = useRelkitClient();
  const status = useSyncExternalStore(
    (listener) => realtime.listenStatus(listener),
    () => realtime.status,
    (): RealtimeStatus => "idle",
  );
  const subscribe: UseRealtimeResult["subscribe"] = (name, params, listener) =>
    realtime.subscribe(name, params, listener);
  return {
    status,
    subscribe,
    bind: subscribe,
    unbind: (stop) => stop(),
    unsubscribe: (stop) => stop(),
  };
}

export type ChannelHandlers<Name extends ChannelSelector> = Partial<{
  readonly [Event in keyof EventsFor<Name>]: (payload: EventsFor<Name>[Event]) => void;
}>;

export interface UseChannelOptions<Name extends ChannelSelector> {
  readonly params: ParamsFor<Name>;
  readonly on?: ChannelHandlers<Name>;
  readonly onCaughtUp?: () => void | Promise<void>;
  readonly onGap?: (reason: string) => void | Promise<void>;
}

interface ChannelState {
  readonly status: RealtimeStatus;
  readonly checkpoint?: ChannelCheckpoint;
  readonly caughtUp: boolean;
  readonly gap?: string;
  readonly presence?: unknown;
}

export type UseChannelResult<Name extends ChannelSelector> = Omit<ChannelState, "presence"> &
  ([PresenceFor<Name>] extends [never] ? {} : { readonly presence: PresenceFor<Name> });

export function useChannel<Name extends ChannelSelector>(
  name: Name,
  options: UseChannelOptions<Name>,
): UseChannelResult<Name> {
  const runtime = useRelkitClient();
  const callbacks = useRef(options);
  useLayoutEffect(() => {
    callbacks.current = options;
  }, [options]);
  const subscriptionKey = realtimeSubscriptionKey(name, options.params);
  const [state, setState] = useState<ChannelState>({ status: "idle", caughtUp: false });
  useEffect(() => {
    if (runtime.status !== "ready" || runtime.identityKey === null) return;
    setState({ status: "connecting", caughtUp: false });
    return runtime.realtime.subscribe(
      name,
      callbacks.current.params,
      (frame) => {
        void applyFrame(frame, callbacks.current, setState);
      },
      (status) => setState((current) => ({ ...current, status })),
    );
  }, [name, subscriptionKey, runtime.identityKey, runtime.realtime, runtime.status]);
  return state as UseChannelResult<Name>;
}

async function applyFrame<Name extends ChannelSelector>(
  frame: RealtimeFrame,
  options: UseChannelOptions<Name>,
  update: (value: ChannelState | ((current: ChannelState) => ChannelState)) => void,
): Promise<void> {
  if (frame.kind === "event") {
    (
      options.on?.[frame.event as keyof EventsFor<Name>] as ((payload: unknown) => void) | undefined
    )?.(frame.payload);
    update((current) => ({ ...current, status: "connected", checkpoint: frame.checkpoint }));
  } else if (frame.kind === "presence") {
    update((current) => ({ ...current, presence: frame.presence }));
  } else if (frame.kind === "caught-up") {
    await options.onCaughtUp?.();
    update((current) => {
      const { gap: _gap, ...withoutGap } = current;
      return {
        ...withoutGap,
        status: "connected",
        checkpoint: frame.checkpoint,
        caughtUp: true,
      };
    });
  } else {
    update((current) => ({
      ...current,
      checkpoint: frame.checkpoint,
      caughtUp: false,
      gap: frame.reason,
    }));
    await options.onGap?.(frame.reason);
    update((current) => ({ ...current, caughtUp: true }));
  }
}

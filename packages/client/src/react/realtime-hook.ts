"use client";

import type {
  EventsFor,
  UseRealtimeResult,
  UseChannelOptions,
  ChannelState,
  UseChannelResult,
} from "./realtime-hook.types.js";
export type {
  UseRealtimeResult,
  ChannelHandlers,
  UseChannelOptions,
  UseChannelResult,
} from "./realtime-hook.types.js";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRelkitClient } from "./context.js";
import {
  realtimeSubscriptionKey,
  type RealtimeFrame,
  type RealtimeStatus,
} from "./realtime-manager.js";
import type { ChannelSelector } from "./registry.types.js";

/**
 * Adapts manager status and explicit subscription leases into React's external store.
 * @returns Manager status and explicit subscription controls.
 */
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

/**
 * Borrows one shared channel session and projects ordered frames into React state.
 * @typeParam Name - Declared resource or procedure selector.
 * @param name - Declared resource or selector identity.
 * @param options - Existing public configuration and authority.
 * @returns The projected channel state and declared event controls.
 */
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

/**
 * Publishes existing channel events, presence and recovery callbacks.
 * @typeParam Name - Declared resource or procedure selector.
 * @param frame - Original observation frame.
 * @param options - Existing public configuration and authority.
 * @param update - Borrowed state publication callback.
 * @returns A Promise for the existing result, preserving original rejected values.
 */
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

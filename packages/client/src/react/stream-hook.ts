"use client";

import type { StreamState, UseStreamResult } from "./stream-hook.types.js";
export type { StreamState, UseStreamResult } from "./stream-hook.types.js";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRelkitClient } from "./context.js";
import { runExecutionPromise } from "@relkit/contracts/operation";
import { clientStreams, streamRuntime } from "./stream-runtime.js";
import type { ErrorFor, InputFor, ItemFor, StreamSelector } from "./registry.types.js";

/**
 * Adapts a declared scoped stream into React state and explicit cancellation controls.
 * @typeParam Name - Declared resource or procedure selector.
 * @param name - Declared resource or selector identity.
 * @param options - Existing public configuration and authority.
 * @returns Current stream state and stable start/abort controls.
 */
export function useStream<Name extends StreamSelector>(
  name: Name,
  options: { readonly autoStart?: boolean; readonly input?: InputFor<Name> } = {},
): UseStreamResult<InputFor<Name>, ItemFor<Name>, ErrorFor<Name>> {
  const runtime = useRelkitClient();
  const controller = useRef<AbortController | undefined>(undefined);
  const [state, setState] = useState<StreamState<ItemFor<Name>, ErrorFor<Name>>>({
    status: "idle",
    items: [],
  });
  const cancel = useCallback(() => {
    controller.current?.abort();
    setState((current) => ({ ...current, status: "cancelled" }));
  }, []);
  const reset = useCallback(() => {
    controller.current?.abort();
    setState({ status: "idle", items: [] });
  }, []);
  const start = useCallback(
    async (input: InputFor<Name>): Promise<void> => {
      if (runtime.status !== "ready")
        throw new Error(`Relkit client is not ready (${runtime.status})`);
      controller.current?.abort();
      const next = new AbortController();
      controller.current = next;
      setState({ status: "starting", items: [] });
      try {
        await runExecutionPromise(
          streamRuntime,
          clientStreams.consume(
            runtime.streamClient,
            name,
            input,
            next.signal,
            () => setState({ status: "streaming", items: [] }),
            (item) => {
              setState((current) => ({
                ...current,
                status: "streaming",
                items: [...current.items, item as ItemFor<Name>],
              }));
            },
          ),
          { signal: next.signal },
        );
        if (!next.signal.aborted) setState((current) => ({ ...current, status: "completed" }));
      } catch (error) {
        if (!next.signal.aborted)
          setState((current) => ({ ...current, status: "error", error: error as ErrorFor<Name> }));
      }
    },
    [name, runtime],
  );
  useEffect(() => {
    if (options.autoStart && options.input !== undefined) void start(options.input);
    return () => controller.current?.abort();
  }, [options.autoStart, options.input, start]);
  return { ...state, start, cancel, reset };
}

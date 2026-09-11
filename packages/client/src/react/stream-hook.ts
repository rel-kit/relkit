"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRelkitClient } from "./context.js";
import { procedureCall } from "./procedure.js";
import type { ErrorFor, InputFor, ItemFor, StreamSelector } from "./registry.js";

export interface StreamState<Item, Error> {
  readonly status: "idle" | "starting" | "streaming" | "completed" | "cancelled" | "error";
  readonly items: readonly Item[];
  readonly error?: Error;
}

export interface UseStreamResult<Input, Item, Error> extends StreamState<Item, Error> {
  readonly start: (input: Input) => Promise<void>;
  readonly cancel: () => void;
  readonly reset: () => void;
}

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
        const call = procedureCall(runtime.streamClient, name);
        const stream = (await call(input, { signal: next.signal })) as AsyncIterable<ItemFor<Name>>;
        setState({ status: "streaming", items: [] });
        for await (const item of stream) {
          if (next.signal.aborted) break;
          setState((current) => ({
            ...current,
            status: "streaming",
            items: [...current.items, item],
          }));
        }
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

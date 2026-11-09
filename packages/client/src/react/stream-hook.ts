"use client";

import type { StreamState, UseStreamResult } from "./stream-hook.types.js";
export type { StreamState, UseStreamResult } from "./stream-hook.types.js";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRelkitClient } from "./context.js";
import { apiRoutePath, API_ROOT } from "../api.js";
import type { ApiStreamRoute, RouteError, RouteInput, RouteItem } from "../api.types.js";
import { normalizeClientError } from "../client-errors.js";
import { procedureCall } from "./procedure.js";

/**
 * Adapts a declared scoped stream into React state and explicit cancellation controls.
 * @typeParam Route - A streamed route from the generated `api` object.
 * @param route - The route, such as `api.reports.streamReport`.
 * @param options - Optional input to start with on mount.
 * @returns Current stream state and stable start/abort controls.
 */
export function useStream<Route extends ApiStreamRoute>(
  route: Route,
  options: { readonly autoStart?: boolean; readonly input?: RouteInput<Route> } = {},
): UseStreamResult<RouteInput<Route>, RouteItem<Route>, RouteError<Route>> {
  const runtime = useRelkitClient();
  const controller = useRef<AbortController | undefined>(undefined);
  const [state, setState] = useState<StreamState<RouteItem<Route>, RouteError<Route>>>({
    status: "idle",
    items: [],
  });
  const path = apiRoutePath(route);
  const cancel = useCallback(() => {
    controller.current?.abort();
    setState((current) => ({ ...current, status: "cancelled" }));
  }, []);
  const reset = useCallback(() => {
    controller.current?.abort();
    setState({ status: "idle", items: [] });
  }, []);
  const start = useCallback(
    async (input: RouteInput<Route>): Promise<void> => {
      if (runtime.status !== "ready")
        throw new Error(`RelKit client is not ready (${runtime.status})`);
      controller.current?.abort();
      const next = new AbortController();
      controller.current = next;
      setState({ status: "starting", items: [] });
      try {
        const iterable = (await procedureCall(runtime.streamClient, [API_ROOT, ...path])(input, {
          signal: next.signal,
        })) as AsyncIterable<RouteItem<Route>>;
        if (next.signal.aborted) return;
        setState({ status: "streaming", items: [] });
        for await (const item of iterable) {
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
          setState((current) => ({
            ...current,
            status: "error",
            error: normalizeClientError(error) as RouteError<Route>,
          }));
      }
    },
    // The path array is rebuilt each render; its joined form is the stable identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [path.join("."), runtime],
  );
  useEffect(() => {
    if (options.autoStart && options.input !== undefined) void start(options.input);
    return () => controller.current?.abort();
  }, [options.autoStart, options.input, start]);
  return { ...state, start, cancel, reset };
}

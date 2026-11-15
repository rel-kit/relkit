"use client";

import { useEffect, useState } from "react";
import {
  createInspectorBackendStream,
  createInspectorClient,
  INSPECTOR_BACKEND_CONNECTED_EVENT,
} from "./client";
import { normalizeGraphResponse, type GraphSnapshot } from "./graph-model";
import type { InspectorGraph } from "./api-types";
import type { StreamConnectionState } from "./stream";

export interface InspectorGraphState {
  readonly source: InspectorGraph | undefined;
  readonly graph: GraphSnapshot | undefined;
  readonly connection: StreamConnectionState;
  readonly droppedEvents: number;
  readonly loading: boolean;
  readonly error: boolean;
}

const initialState: InspectorGraphState = {
  source: undefined,
  graph: undefined,
  connection: "connecting",
  droppedEvents: 0,
  loading: true,
  error: false,
};

/**
 * Reads one graph response into hook state. A response without a graph (an application that
 * serves only the identity probe) is the not-available state, never an error thrown in render.
 */
export function graphLoaded(
  payload: InspectorGraph,
): Pick<InspectorGraphState, "source" | "graph" | "loading" | "error"> {
  try {
    return {
      source: payload,
      graph: normalizeGraphResponse(payload),
      loading: false,
      error: false,
    };
  } catch {
    return { source: undefined, graph: undefined, loading: false, error: true };
  }
}

export function useInspectorGraph(): InspectorGraphState {
  const [state, setState] = useState(initialState);

  useEffect(() => {
    let disposed = false;
    const api = createInspectorClient();
    const load = () => {
      setState((current) => ({ ...current, loading: true, error: false }));
      void api
        .graph()
        .then((payload) => {
          if (disposed) return;
          const loaded = graphLoaded(payload);
          setState((current) => ({ ...current, ...loaded }));
          if (!loaded.error) window.dispatchEvent(new Event(INSPECTOR_BACKEND_CONNECTED_EVENT));
        })
        .catch(() => {
          if (!disposed) setState((current) => ({ ...current, loading: false, error: true }));
        });
    };
    const stream = createInspectorBackendStream({
      cache: { invalidate: (tags) => api.invalidate(tags) },
      onInvalidate: (tags) => {
        if (tags.includes("graph")) load();
      },
      onStateChange: (snapshot) => {
        if (disposed) return;
        setState((current) => ({
          ...current,
          connection: snapshot.state,
          droppedEvents: snapshot.droppedEvents,
        }));
      },
    });
    load();
    stream.start();
    return () => {
      disposed = true;
      stream.stop();
    };
  }, []);

  return state;
}

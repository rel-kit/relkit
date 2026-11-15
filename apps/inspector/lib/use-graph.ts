"use client";

import { useEffect, useState } from "react";
import {
  createInspectorBackendStream,
  createInspectorClient,
  INSPECTOR_BACKEND_CONNECTED_EVENT,
} from "./client";
import { GraphStore } from "./graph-store";
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

let store: GraphStore | undefined;

/** The tab's graph: one read per generation, shared by every component that shows it. */
export function sharedGraphStore(): GraphStore {
  store ??= new GraphStore({
    read: (fresh) => {
      const api = createInspectorClient();
      if (fresh) api.invalidate(["graph"]);
      return api.graph();
    },
  });
  return store;
}

export function useInspectorGraph(): InspectorGraphState {
  const [state, setState] = useState(initialState);

  useEffect(() => {
    let disposed = false;
    const graphs = sharedGraphStore();
    const apply = (payload: InspectorGraph | undefined) => {
      if (disposed) return;
      if (payload === undefined) {
        setState((current) => ({ ...current, loading: false, error: true }));
        return;
      }
      setState((current) => ({ ...current, ...graphLoaded(payload) }));
    };
    const unsubscribe = graphs.subscribe((payload) => {
      apply(payload);
      if (payload !== undefined) window.dispatchEvent(new Event(INSPECTOR_BACKEND_CONNECTED_EVENT));
    });
    const stream = createInspectorBackendStream({
      cache: { invalidate: (tags) => createInspectorClient().invalidate(tags) },
      onInvalidate: (_tags, event) => {
        if (event?.type === "generation.changed") graphs.changed(event.data);
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
    // A graph that is already loaded is shown at once; otherwise this is the read that loads it.
    if (graphs.current !== undefined) apply(graphs.current);
    else void graphs.load().catch(() => undefined);
    stream.start();
    return () => {
      disposed = true;
      unsubscribe();
      stream.stop();
    };
  }, []);

  return state;
}

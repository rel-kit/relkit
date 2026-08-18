"use client";

import { useEffect, useState } from "react";
import { createInspectorBackendStream, createInspectorClient } from "./client";
import { normalizeGraphResponse, type GraphSnapshot } from "./graph-model";
import type { StreamConnectionState } from "./stream";

export interface InspectorGraphState {
  readonly graph: GraphSnapshot | undefined;
  readonly connection: StreamConnectionState;
  readonly droppedEvents: number;
  readonly loading: boolean;
  readonly error: boolean;
}

const initialState: InspectorGraphState = {
  graph: undefined,
  connection: "connecting",
  droppedEvents: 0,
  loading: true,
  error: false,
};

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
          setState((current) => ({
            ...current,
            graph: normalizeGraphResponse(payload),
            loading: false,
            error: false,
          }));
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
        if (!disposed)
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

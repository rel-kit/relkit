"use client";

import { useEffect, useState } from "react";
import { createInspectorBackendStream, createInspectorClient } from "../lib/client";
import { normalizeDiagnostics, type DiagnosticsSnapshot } from "../lib/env-diagnostics-model";
import { DiagnosticsView } from "./diagnostics-view";

export function DiagnosticsClient() {
  const [snapshot, setSnapshot] = useState<DiagnosticsSnapshot>();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [liveState, setLiveState] = useState("connecting");

  useEffect(() => {
    let disposed = false;
    const api = createInspectorClient();
    const load = (): void => {
      setState("loading");
      void Promise.all([api.diagnostics({ limit: 100 }), api.graph()])
        .then(([payload, graph]) => {
          if (disposed) return;
          setSnapshot(normalizeDiagnostics(payload, graph));
          setState("ready");
        })
        .catch(() => {
          if (!disposed) setState("error");
        });
    };
    const stream = createInspectorBackendStream({
      cache: { invalidate: (tags) => api.invalidate(tags) },
      onStateChange: (current) => {
        if (!disposed) setLiveState(current.state);
      },
      onInvalidate: (tags) => {
        if (tags.includes("diagnostics")) load();
      },
    });
    load();
    stream.start();
    return () => {
      disposed = true;
      stream.stop();
    };
  }, []);

  return <DiagnosticsView snapshot={snapshot} state={state} liveState={liveState} />;
}

"use client";

import { useEffect, useState } from "react";
import { createInspectorBackendStream, createInspectorClient } from "../lib/client";
import { normalizeEnvironment, type EnvironmentSnapshot } from "../lib/env-diagnostics-model";
import { EnvironmentView } from "./environment-view";

export function EnvironmentClient() {
  const [snapshot, setSnapshot] = useState<EnvironmentSnapshot>();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [liveState, setLiveState] = useState("connecting");

  useEffect(() => {
    let disposed = false;
    const api = createInspectorClient();
    const load = (): void => {
      setState("loading");
      void api
        .env({ limit: 100 })
        .then((payload) => {
          if (disposed) return;
          setSnapshot(normalizeEnvironment(payload));
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
        if (tags.includes("env")) load();
      },
    });
    load();
    stream.start();
    return () => {
      disposed = true;
      stream.stop();
    };
  }, []);

  return <EnvironmentView snapshot={snapshot} state={state} liveState={liveState} />;
}

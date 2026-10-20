"use client";

import { useEffect, useState } from "react";
import { createInspectorClient, INSPECTOR_BACKEND_CONNECTED_EVENT } from "./client";
import { loadDevelopmentFailure, type DevelopmentFailure } from "./development-failure";

export function useDevelopmentFailure() {
  const [failure, setFailure] = useState<DevelopmentFailure>();
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let disposed = false;
    let loading = false;
    let current: DevelopmentFailure | undefined;
    const client = createInspectorClient();
    const refresh = async (): Promise<void> => {
      if (loading || document.visibilityState === "hidden") return;
      loading = true;
      client.invalidate(["logs", "signals"]);
      try {
        const next = await loadDevelopmentFailure(client, current);
        if (disposed) return;
        current = next;
        setFailure(next);
        setUnavailable(false);
      } catch {
        if (!disposed) setUnavailable(true);
      } finally {
        loading = false;
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 3_000);
    window.addEventListener(INSPECTOR_BACKEND_CONNECTED_EVENT, refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      disposed = true;
      clearInterval(timer);
      window.removeEventListener(INSPECTOR_BACKEND_CONNECTED_EVENT, refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  return { failure, unavailable };
}

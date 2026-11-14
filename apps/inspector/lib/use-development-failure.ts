"use client";

import { useEffect, useState } from "react";
import { createInspectorBackendStream, createInspectorClient } from "./client";
import {
  failureRefresh,
  loadDevelopmentFailure,
  type DevelopmentFailure,
} from "./development-failure";

/** Coalesces log-driven re-reads: a busy application reads at most once per interval. */
const LOG_REFRESH_MS = 3_000;

/**
 * Reads the latest reload failure once on mount and again only when the live stream reports a
 * change (IN-43): no timer runs while the application is idle.
 */
export function useDevelopmentFailure() {
  const [failure, setFailure] = useState<DevelopmentFailure>();
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let disposed = false;
    let loading = false;
    let again = false;
    let later: ReturnType<typeof setTimeout> | undefined;
    let connected: boolean | undefined;
    let current: DevelopmentFailure | undefined;
    const client = createInspectorClient();
    const refresh = async (): Promise<void> => {
      if (loading) {
        again = true;
        return;
      }
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
        if (again && !disposed) {
          again = false;
          void refresh();
        }
      }
    };
    const stream = createInspectorBackendStream({
      onStateChange: (snapshot) => {
        const now = snapshot.state === "connected";
        // A reconnect may have missed a failure; the first connection follows the mount read.
        if (now && connected === false) void refresh();
        if (connected !== undefined || now) connected = now;
      },
      onEvent: (event) => {
        const when = failureRefresh(event.type);
        if (when === "now") void refresh();
        else if (when === "later" && later === undefined)
          later = setTimeout(() => {
            later = undefined;
            void refresh();
          }, LOG_REFRESH_MS);
      },
    });
    void refresh();
    stream.start();
    return () => {
      disposed = true;
      if (later !== undefined) clearTimeout(later);
      stream.stop();
    };
  }, []);

  return { failure, unavailable };
}

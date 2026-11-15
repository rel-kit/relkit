"use client";

import { useEffect, useRef, useState } from "react";
import type { InspectorObject } from "../../lib/api-types";
import {
  createInspectorBackendStream,
  createInspectorClient,
  INSPECTOR_BACKEND_CONNECTED_EVENT,
} from "../../lib/client";

export interface SampleState {
  readonly items: readonly InspectorObject[];
  /** More records exist beyond this sample. */
  readonly truncated: boolean;
  readonly state: "loading" | "ready" | "error";
}

export interface OverviewSignals {
  readonly requests: SampleState;
  readonly generations: SampleState;
}

const initialSample: SampleState = { items: [], truncated: false, state: "loading" };
const REQUEST_SAMPLE = 100;
const REFRESH_THROTTLE_MS = 2_000;
const LOG_REFRESH_MS = 5_000;

/**
 * Bounded, read-only samples behind the Overview dashboard: the latest requests (refreshed from
 * the live stream, throttled), dev generation logs (refreshed when the active generation or its
 * diagnostics change). History status comes from the shell's shared Inspector state.
 * @param generationId - Active generation; a change reloads the generation history.
 */
export function useOverviewSignals(generationId: string | undefined): OverviewSignals {
  const [requests, setRequests] = useState<SampleState>(initialSample);
  const [generations, setGenerations] = useState<SampleState>(initialSample);
  const reloadGenerations = useRef<() => void>(() => undefined);

  useEffect(() => {
    let disposed = false;
    const client = createInspectorClient();
    let requestTimer: ReturnType<typeof setTimeout> | undefined;
    let logTimer: ReturnType<typeof setTimeout> | undefined;
    const loadRequests = async (): Promise<void> => {
      try {
        const page = await client.query<InspectorObject>("requests", {
          limit: REQUEST_SAMPLE,
          order: "desc",
        });
        if (!disposed)
          setRequests({
            items: page.items,
            truncated: page.nextCursor !== undefined,
            state: "ready",
          });
      } catch {
        if (!disposed) setRequests((current) => ({ ...current, state: "error" }));
      }
    };
    const loadGenerations = async (): Promise<void> => {
      client.invalidate(["logs"]);
      try {
        const page = await client.query<InspectorObject>("logs", {
          source: "relkit",
          search: "dev.generation.",
          order: "desc",
          limit: 20,
        });
        if (!disposed)
          setGenerations({
            items: page.items,
            truncated: page.nextCursor !== undefined,
            state: "ready",
          });
      } catch {
        if (!disposed) setGenerations((current) => ({ ...current, state: "error" }));
      }
    };
    reloadGenerations.current = () => void loadGenerations();
    const scheduleRequests = (): void => {
      if (requestTimer !== undefined) return;
      requestTimer = setTimeout(() => {
        requestTimer = undefined;
        void loadRequests();
      }, REFRESH_THROTTLE_MS);
    };
    const reconnect = (): void => {
      void loadRequests();
      void loadGenerations();
    };
    const stream = createInspectorBackendStream({
      cache: { invalidate: (tags) => client.invalidate(tags) },
      onInvalidate: (tags) => {
        if (tags.includes("requests")) scheduleRequests();
        if (tags.includes("diagnostics")) void loadGenerations();
        // A failed reload is only a supervisor log; re-read on new logs, at most every 5 s.
        else if (tags.includes("logs") && logTimer === undefined)
          logTimer = setTimeout(() => {
            logTimer = undefined;
            void loadGenerations();
          }, LOG_REFRESH_MS);
      },
    });
    void loadRequests();
    window.addEventListener(INSPECTOR_BACKEND_CONNECTED_EVENT, reconnect);
    stream.start();
    return () => {
      disposed = true;
      reloadGenerations.current = () => undefined;
      if (requestTimer !== undefined) clearTimeout(requestTimer);
      if (logTimer !== undefined) clearTimeout(logTimer);
      window.removeEventListener(INSPECTOR_BACKEND_CONNECTED_EVENT, reconnect);
      stream.stop();
    };
  }, []);

  useEffect(() => {
    reloadGenerations.current();
  }, [generationId]);

  return { requests, generations };
}

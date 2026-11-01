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
  /** History storage status from `/_relkit/v1/storage`; `{ state: "unavailable" }` on failure. */
  readonly storage: InspectorObject | undefined;
}

const initialSample: SampleState = { items: [], truncated: false, state: "loading" };
const REQUEST_SAMPLE = 100;
const REFRESH_THROTTLE_MS = 2_000;

/**
 * Bounded, read-only samples behind the Overview dashboard: the latest requests (refreshed from
 * the live stream, throttled), dev generation logs (refreshed when the active generation or its
 * diagnostics change), and history storage status (polled like the shared history notice).
 * @param generationId - Active generation; a change reloads the generation history.
 */
export function useOverviewSignals(generationId: string | undefined): OverviewSignals {
  const [requests, setRequests] = useState<SampleState>(initialSample);
  const [generations, setGenerations] = useState<SampleState>(initialSample);
  const [storage, setStorage] = useState<InspectorObject>();
  const reloadGenerations = useRef<() => void>(() => undefined);

  useEffect(() => {
    let disposed = false;
    const client = createInspectorClient();
    let requestTimer: ReturnType<typeof setTimeout> | undefined;
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
      },
    });
    void loadRequests();
    window.addEventListener(INSPECTOR_BACKEND_CONNECTED_EVENT, reconnect);
    stream.start();
    return () => {
      disposed = true;
      reloadGenerations.current = () => undefined;
      if (requestTimer !== undefined) clearTimeout(requestTimer);
      window.removeEventListener(INSPECTOR_BACKEND_CONNECTED_EVENT, reconnect);
      stream.stop();
    };
  }, []);

  useEffect(() => {
    reloadGenerations.current();
  }, [generationId]);

  useEffect(() => {
    const controller = new AbortController();
    const client = createInspectorClient();
    let pending = false;
    const read = async (): Promise<void> => {
      if (pending) return;
      pending = true;
      try {
        const next = await client.request<InspectorObject>("/_relkit/v1/storage", {
          cache: "no-store",
          signal: controller.signal,
          responseProtocols: ["relkit.observability.query"],
        });
        if (!controller.signal.aborted) setStorage(next);
      } catch {
        if (!controller.signal.aborted) setStorage({ state: "unavailable" });
      } finally {
        pending = false;
      }
    };
    void read();
    const timer = setInterval(() => void read(), 10_000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, []);

  return { requests, generations, storage };
}

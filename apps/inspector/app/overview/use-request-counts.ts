"use client";

import { useEffect, useState } from "react";
import type { InspectorObject } from "../../lib/api-types";
import { createInspectorBackendStream, createInspectorClient } from "../../lib/client";
import type { RequestCounts } from "../../lib/overview-counts";

/** Recounts at most this often, and only after new requests arrived. */
const RECOUNT_MS = 30_000;

/**
 * Every retained request and every 5xx among them (IN-16): two count queries on load, then again
 * at most every 30 seconds while new requests arrive, never per live event. Undefined while
 * counting, or when the history cannot count.
 */
export function useRequestCounts(): RequestCounts | undefined {
  const [counts, setCounts] = useState<RequestCounts>();
  useEffect(() => {
    let disposed = false;
    let dirty = false;
    const client = createInspectorClient();
    const total = (query: Record<string, unknown>) =>
      client
        .query<InspectorObject>("requests", { ...query, limit: 1, count: true })
        .then((page) => page.total);
    const load = async (): Promise<void> => {
      dirty = false;
      client.invalidate(["requests"]);
      try {
        const [all, failed] = await Promise.all([total({}), total({ status: "5xx" })]);
        if (disposed) return;
        setCounts(all === undefined || failed === undefined ? undefined : { total: all, failed });
      } catch {
        if (!disposed) setCounts(undefined);
      }
    };
    const stream = createInspectorBackendStream({
      onInvalidate: (tags) => {
        if (tags.includes("requests")) dirty = true;
      },
    });
    void load();
    stream.start();
    const timer = setInterval(() => {
      if (dirty && document.visibilityState !== "hidden") void load();
    }, RECOUNT_MS);
    return () => {
      disposed = true;
      clearInterval(timer);
      stream.stop();
    };
  }, []);
  return counts;
}

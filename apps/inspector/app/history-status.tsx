"use client";

import { useEffect, useState } from "react";
import type { InspectorObject } from "../lib/api-types";
import { createInspectorClient } from "../lib/client";
import { historyStatusMessage } from "../lib/history-status";

/** Shares the tool-owned collection status across historical views. */
export function HistoryStatus({ value }: { readonly value: InspectorObject | undefined }) {
  return (
    <p
      className="panel supporting-copy"
      role={value?.incomplete === true || value?.state === "degraded" ? "alert" : "status"}
    >
      {historyStatusMessage(value)}
    </p>
  );
}

/** Native requests are cancelled when this view leaves; no poll can outlive it. */
export function LiveHistoryStatus() {
  const [value, setValue] = useState<InspectorObject>();
  useEffect(() => {
    const controller = new AbortController();
    const client = createInspectorClient();
    let pending = false;
    const read = async () => {
      if (pending) return;
      pending = true;
      try {
        const next = await client.request<InspectorObject>("/_relkit/v1/storage", {
          cache: "no-store",
          signal: controller.signal,
          responseProtocols: ["relkit.observability.query"],
        });
        if (!controller.signal.aborted) setValue(next);
      } catch {
        if (!controller.signal.aborted) setValue({ state: "unavailable" });
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
  return <HistoryStatus value={value} />;
}

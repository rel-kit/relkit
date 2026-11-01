"use client";

import { useEffect, useState } from "react";
import type { InspectorObject } from "../lib/api-types";
import { createInspectorClient } from "../lib/client";
import { historyStatusMessage } from "../lib/history-status";
import { cn } from "../lib/utils";

/** Shares the tool-owned collection status across historical views. */
export function HistoryStatus({ value }: { readonly value: InspectorObject | undefined }) {
  const alert = value?.incomplete === true || value?.state === "degraded";
  const tone = historyTone(value, alert);
  return (
    <div
      className={cn(
        "history-status m-0 flex min-w-0 items-start gap-2 rounded-md border px-3 py-2 text-xs leading-5",
        alert
          ? "border-warning/30 bg-warning-soft text-foreground"
          : "border-border bg-card text-muted-foreground",
      )}
      data-tone={tone}
      role={alert ? "alert" : "status"}
    >
      <span
        aria-hidden="true"
        className={cn("mt-[7px] size-1.5 shrink-0 rounded-[1px]", DOT[tone])}
      />
      <span className="min-w-0">{historyStatusMessage(value)}</span>
    </div>
  );
}

const DOT = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  neutral: "bg-muted-foreground/50",
} as const;

function historyTone(value: InspectorObject | undefined, alert: boolean): keyof typeof DOT {
  if (value?.state === "degraded" || value?.error !== undefined) return "danger";
  if (alert || value?.connection === "ambiguous" || value?.connection === "disconnected")
    return "warning";
  if (!value || value.state === "unavailable") return "neutral";
  return "success";
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

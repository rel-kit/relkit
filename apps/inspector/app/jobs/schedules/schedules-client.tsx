"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { InspectorObject } from "../../../lib/api-types";
import { createInspectorClient } from "../../../lib/client";
import { JobsTabs } from "../jobs-tabs";

export function JobsSchedulesClient() {
  const api = useMemo(() => createInspectorClient(), []);
  const [items, setItems] = useState<readonly InspectorObject[]>([]);
  const [availability, setAvailability] = useState<readonly InspectorObject[]>([]);
  const [cursor, setCursor] = useState<string>();
  const [history, setHistory] = useState<readonly (string | undefined)[]>([undefined]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string>();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [pending, setPending] = useState("");
  const load = useCallback(async (): Promise<void> => {
    setState("loading");
    try {
      const result = await api.jobSchedules<InspectorObject>(cursor === undefined ? {} : { cursor });
      setItems(result.items);
      setAvailability(result.availability);
      setHasMore(result.hasMore);
      setNextCursor(result.nextCursor);
      setState("ready");
    } catch {
      setState("error");
    }
  }, [api, cursor]);
  useEffect(() => { void load(); }, [load]);
  const action = async (kind: "pause" | "resume" | "delete", id: string, service: string): Promise<void> => {
    setPending(`${kind}:${id}`);
    try { await api.jobScheduleAction(kind, id, { service }); await load(); } finally { setPending(""); }
  };
  return <><JobsTabs /><main className="route-page"><header className="page-heading"><div><p className="eyebrow">JOBS / SCHEDULES</p><h1>Schedules</h1><p className="lede">Native schedules and their provider-reported state.</p></div></header>{availability.some((item) => item.state === "unavailable") && <p className="field-errors" role="status">Some jobs services are unavailable.</p>}{state === "loading" && <p className="panel route-state" role="status">Loading schedules…</p>}{state === "error" && <p className="panel route-state" role="alert">Schedules are unavailable.</p>}{state === "ready" && <ScheduleTable items={items} pending={pending} onAction={action} />}<nav aria-label="Schedule pagination" className="flex items-center justify-between gap-3"><button className="button button-secondary" disabled={page === 0 || state === "loading"} onClick={() => { const previous = Math.max(0, page - 1); setPage(previous); setCursor(history[previous]); }} type="button">Previous</button><span aria-live="polite">Page {page + 1}</span><button className="button button-secondary" disabled={!hasMore || nextCursor === undefined || state === "loading"} onClick={() => { if (nextCursor === undefined) return; setHistory((value) => [...value.slice(0, page + 1), nextCursor]); setPage((value) => value + 1); setCursor(nextCursor); }} type="button">Next</button></nav></main></>;
}

function ScheduleTable({ items, pending, onAction }: { readonly items: readonly InspectorObject[]; readonly pending: string; readonly onAction: (kind: "pause" | "resume" | "delete", id: string, service: string) => Promise<void> }) {
  return items.length === 0 ? <p className="panel route-state">No schedules are available.</p> : <div className="panel overflow-x-auto"><table className="resource-table"><caption className="sr-only">Job schedules</caption><thead><tr><th scope="col">Schedule</th><th scope="col">Job</th><th scope="col">State</th><th scope="col">Service</th><th scope="col">Controls</th></tr></thead><tbody>{items.map((item, index) => { const schedule = record(item.schedule); const id = text(schedule?.id); const service = text(item.service); const state = text(schedule?.state); return <tr key={`${id}-${index}`}><th scope="row">{id || "unknown"}</th><td>{text(schedule?.jobId) || "—"}</td><td>{state || "unknown"}</td><td>{service || "—"}</td><td className="flex gap-2"><button className="button button-secondary" disabled={pending !== "" || id === ""} onClick={() => void onAction(state === "paused" ? "resume" : "pause", id, service)} type="button">{pending === `pause:${id}` || pending === `resume:${id}` ? "Requesting…" : state === "paused" ? "Resume" : "Pause"}</button><button className="button button-secondary" disabled={pending !== "" || id === ""} onClick={() => void onAction("delete", id, service)} type="button">Delete</button></td></tr>; })}</tbody></table></div>;
}
function record(value: unknown): InspectorObject | undefined { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as InspectorObject : undefined; }
function text(value: unknown): string { return typeof value === "string" ? value : ""; }

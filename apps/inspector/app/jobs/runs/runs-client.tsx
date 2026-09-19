"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import type { InspectorJobRunQuery, InspectorObject } from "../../../lib/api-types";
import { createInspectorClient } from "../../../lib/client";
import { RUN_STATES } from "../../../lib/jobs-model";
import { JobsTabs } from "../jobs-tabs";

export function JobsRunsClient() {
  const api = useMemo(() => createInspectorClient(), []);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState(() => searchParams.get("status") ?? "");
  const [service, setService] = useState(() => searchParams.get("service") ?? "");
  const [jobId, setJobId] = useState(() => searchParams.get("jobId") ?? "");
  const [runId, setRunId] = useState(() => searchParams.get("runId") ?? "");
  const [acceptedFrom, setAcceptedFrom] = useState(() => searchParams.get("acceptedFrom") ?? "");
  const [acceptedTo, setAcceptedTo] = useState(() => searchParams.get("acceptedTo") ?? "");
  const [cursor, setCursor] = useState<string>();
  const [history, setHistory] = useState<readonly (string | undefined)[]>([undefined]);
  const [page, setPage] = useState(0);
  const [items, setItems] = useState<readonly InspectorObject[]>([]);
  const [availability, setAvailability] = useState<readonly InspectorObject[]>([]);
  const [partial, setPartial] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string>();
  const [live, setLive] = useState(true);
  const [newRuns, setNewRuns] = useState(false);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [refresh, setRefresh] = useState(0);
  const request = useRef(0);
  const latest = useRef("");
  const query = useMemo<InspectorJobRunQuery>(() => ({
    limit: 25,
    ...(cursor === undefined ? {} : { cursor }),
    ...(status === "" ? {} : { status }),
    ...(service.trim() === "" ? {} : { service: service.trim() }),
    ...(jobId.trim() === "" ? {} : { jobId: jobId.trim() }),
    ...(runId.trim() === "" ? {} : { runId: runId.trim() }),
    ...(acceptedFrom === "" ? {} : { acceptedFrom }),
    ...(acceptedTo === "" ? {} : { acceptedTo }),
  }), [acceptedFrom, acceptedTo, cursor, jobId, runId, service, status]);

  useEffect(() => {
    const params = new URLSearchParams();
    for (const [key, value] of [["status", status], ["service", service], ["jobId", jobId], ["runId", runId], ["acceptedFrom", acceptedFrom], ["acceptedTo", acceptedTo]] as const)
      if (value.trim() !== "") params.set(key, value);
    router.replace(`/jobs/runs${params.toString() === "" ? "" : `?${params.toString()}`}`, { scroll: false });
  }, [acceptedFrom, acceptedTo, jobId, router, runId, service, status]);

  useEffect(() => {
    const current = ++request.current;
    setState("loading");
    void api.jobRuns(query).then((result) => {
      if (current !== request.current) return;
      setItems(result.items);
      setAvailability(result.availability);
      setPartial(result.partial === true);
      setHasMore(result.hasMore);
      setNextCursor(result.nextCursor);
      if (page === 0) latest.current = text(result.items[0]?.runId);
      setState("ready");
    }).catch(() => current === request.current && setState("error"));
  }, [api, query, refresh]);

  useEffect(() => {
    if (!live || page !== 0) return;
    const timer = window.setInterval(() => {
      const { cursor: _cursor, ...firstPage } = query;
      void api.jobRuns({ ...firstPage, limit: 1 }).then((result) => {
        const first = text(result.items[0]?.runId);
        if (latest.current !== "" && first !== "" && first !== latest.current) setNewRuns(true);
      }).catch(() => undefined);
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [api, live, page, query]);

  const reset = (): void => { setHistory([undefined]); setPage(0); setCursor(undefined); setNewRuns(false); };
  const update = (setter: (value: string) => void) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>): void => { setter(event.target.value); reset(); };

  return (
    <>
      <JobsTabs />
      <main className="route-page">
        <header className="page-heading">
          <div><p className="eyebrow">JOBS / RUNS</p><h1>Runs</h1><p className="lede">Bounded native history with explicit service availability.</p></div>
          <div className="flex items-center gap-2"><label><input checked={live} onChange={(event) => setLive(event.target.checked)} type="checkbox" /> Live refresh</label><button className="button button-secondary" onClick={() => { if (newRuns) reset(); setRefresh((value) => value + 1); }} type="button">{newRuns ? "Show new runs" : "Refresh"}</button></div>
        </header>
        <form aria-label="Run filters" className="panel grid gap-3 md:grid-cols-3" onSubmit={(event) => event.preventDefault()}>
          <label>Status<select aria-label="Run status" onChange={update(setStatus)} value={status}><option value="">All statuses</option>{RUN_STATES.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label>Jobs service<input aria-label="Jobs service" onChange={update(setService)} value={service} /></label>
          <label>Job ID or name<input aria-label="Job ID or name" onChange={update(setJobId)} value={jobId} /></label>
          <label>Run ID<input aria-label="Run ID" onChange={update(setRunId)} value={runId} /></label>
          <label>Accepted after<input aria-label="Accepted after" onChange={update(setAcceptedFrom)} type="datetime-local" value={acceptedFrom} /></label>
          <label>Accepted before<input aria-label="Accepted before" onChange={update(setAcceptedTo)} type="datetime-local" value={acceptedTo} /></label>
        </form>
        {(partial || availability.some((item) => item.state === "unavailable")) && <p className="field-errors" role="status">Some jobs services are unavailable; this page is partial.</p>}
        {newRuns && <p className="field-errors" role="status">New runs are available. Refresh to update this page without changing your selected history.</p>}
        {state === "loading" && <p className="panel route-state" role="status">Loading runs…</p>}
        {state === "error" && <p className="panel route-state" role="alert">The run history is unavailable.</p>}
        {state === "ready" && <RunTable items={items} />}
        <nav aria-label="Run history pagination" className="flex items-center justify-between gap-3">
          <button className="button button-secondary" disabled={page === 0 || state === "loading"} onClick={() => { const previous = Math.max(0, page - 1); setPage(previous); setCursor(history[previous]); }} type="button">Previous</button>
          <span aria-live="polite">Page {page + 1}</span>
          <button className="button button-secondary" disabled={!hasMore || nextCursor === undefined || state === "loading"} onClick={() => { if (nextCursor === undefined) return; setHistory((value) => [...value.slice(0, page + 1), nextCursor]); setPage((value) => value + 1); setCursor(nextCursor); }} type="button">Next</button>
        </nav>
      </main>
    </>
  );
}

function RunTable({ items }: { readonly items: readonly InspectorObject[] }) {
  return items.length === 0 ? <p className="panel route-state">No runs match these filters.</p> : (
    <div className="panel overflow-x-auto"><table className="resource-table"><caption className="sr-only">Job runs</caption><thead><tr><th scope="col">Run ID</th><th scope="col">Job</th><th scope="col">Status</th><th scope="col">Accepted</th><th scope="col">Service</th></tr></thead><tbody>{items.map((item) => { const id = text(item.runId); return <tr key={id}><th scope="row"><Link href={`/jobs/runs/${encodeURIComponent(id)}`}>{id || "unknown"}</Link></th><td>{text(item.jobId) || "—"}</td><td aria-label={`Status ${text(item.status) || "unknown"}`}>{text(item.status) || "unknown"}</td><td>{text(item.acceptedAt) || "—"}</td><td>{text(item.service) || "—"}</td></tr>; })}</tbody></table></div>
  );
}

function text(value: unknown): string { return typeof value === "string" ? value : ""; }

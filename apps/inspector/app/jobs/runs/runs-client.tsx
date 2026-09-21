"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { InspectorJobRunQuery, InspectorObject } from "../../../lib/api-types";
import { createInspectorClient } from "../../../lib/client";
import { JobsTabs } from "../jobs-tabs";
import { RunsFilters } from "./runs-filters";
import { RunsPagination } from "./runs-pagination";
import { RunsTable } from "./runs-table";

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
  const query = useMemo<InspectorJobRunQuery>(
    () => ({
      limit: 25,
      ...(cursor === undefined ? {} : { cursor }),
      ...(status === "" ? {} : { status }),
      ...(service.trim() === "" ? {} : { service: service.trim() }),
      ...(jobId.trim() === "" ? {} : { jobId: jobId.trim() }),
      ...(runId.trim() === "" ? {} : { runId: runId.trim() }),
      ...(acceptedFrom === "" ? {} : { acceptedFrom }),
      ...(acceptedTo === "" ? {} : { acceptedTo }),
    }),
    [acceptedFrom, acceptedTo, cursor, jobId, runId, service, status],
  );

  useEffect(() => {
    const params = new URLSearchParams();
    for (const [key, value] of [
      ["status", status],
      ["service", service],
      ["jobId", jobId],
      ["runId", runId],
      ["acceptedFrom", acceptedFrom],
      ["acceptedTo", acceptedTo],
    ] as const)
      if (value.trim() !== "") params.set(key, value);
    router.replace(`/jobs/runs${params.toString() === "" ? "" : `?${params.toString()}`}`, {
      scroll: false,
    });
  }, [acceptedFrom, acceptedTo, jobId, router, runId, service, status]);

  useEffect(() => {
    const current = ++request.current;
    setState("loading");
    void api
      .jobRuns(query)
      .then((result) => {
        if (current !== request.current) return;
        setItems(result.items);
        setAvailability(result.availability);
        setPartial(result.partial === true);
        setHasMore(result.hasMore);
        setNextCursor(result.nextCursor);
        if (page === 0) latest.current = text(result.items[0]?.runId);
        setState("ready");
      })
      .catch(() => current === request.current && setState("error"));
  }, [api, query, refresh]);

  useEffect(() => {
    if (!live || page !== 0) return;
    const timer = window.setInterval(() => {
      const { cursor: _cursor, ...firstPage } = query;
      void api
        .jobRuns({ ...firstPage, limit: 1 })
        .then((result) => {
          const first = text(result.items[0]?.runId);
          if (latest.current !== "" && first !== "" && first !== latest.current) setNewRuns(true);
        })
        .catch(() => undefined);
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [api, live, page, query]);

  const reset = (): void => {
    setHistory([undefined]);
    setPage(0);
    setCursor(undefined);
    setNewRuns(false);
  };
  return (
    <>
      <JobsTabs />
      <main className="route-page">
        <header className="page-heading">
          <div>
            <p className="eyebrow">JOBS / RUNS</p>
            <h1>Runs</h1>
            <p className="lede">Bounded native history with explicit service availability.</p>
          </div>
          <div className="flex items-center gap-2">
            <label>
              <input
                checked={live}
                onChange={(event) => setLive(event.target.checked)}
                type="checkbox"
              />{" "}
              Live refresh
            </label>
            <button
              className="button button-secondary"
              onClick={() => {
                if (newRuns) reset();
                setRefresh((value) => value + 1);
              }}
              type="button"
            >
              {newRuns ? "Show new runs" : "Refresh"}
            </button>
          </div>
        </header>
        <RunsFilters
          status={status}
          service={service}
          jobId={jobId}
          runId={runId}
          acceptedFrom={acceptedFrom}
          acceptedTo={acceptedTo}
          setStatus={setStatus}
          setService={setService}
          setJobId={setJobId}
          setRunId={setRunId}
          setAcceptedFrom={setAcceptedFrom}
          setAcceptedTo={setAcceptedTo}
          reset={reset}
        />
        {(partial || availability.some((item) => item.state === "unavailable")) && (
          <p className="field-errors" role="status">
            Some jobs services are unavailable; this page is partial.
          </p>
        )}
        {newRuns && (
          <p className="field-errors" role="status">
            New runs are available. Refresh to update this page without changing your selected
            history.
          </p>
        )}
        {state === "loading" && (
          <p className="panel route-state" role="status">
            Loading runs…
          </p>
        )}
        {state === "error" && (
          <p className="panel route-state" role="alert">
            The run history is unavailable.
          </p>
        )}
        {state === "ready" && <RunsTable items={items} />}
        <RunsPagination
          page={page}
          hasMore={hasMore}
          nextCursor={nextCursor}
          loading={state === "loading"}
          onPrevious={() => {
            const previous = Math.max(0, page - 1);
            setPage(previous);
            setCursor(history[previous]);
          }}
          onNext={() => {
            if (nextCursor === undefined) return;
            setHistory((value) => [...value.slice(0, page + 1), nextCursor]);
            setPage((value) => value + 1);
            setCursor(nextCursor);
          }}
        />
      </main>
    </>
  );
}

"use client";

import { RefreshCw } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { InspectorJobRunQuery, InspectorObject } from "../../../lib/api-types";
import { jobsNotMounted } from "../../../lib/api-request-utils";
import { createInspectorClient } from "../../../lib/client";
import { PageHeader } from "../../../components/blocks/page-header";
import { Button } from "../../../components/ui/button";
import { Notice, text } from "../job-format";
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
  const [state, setState] = useState<"loading" | "ready" | "error" | "absent">("loading");
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
      .catch(
        (error: unknown) =>
          current === request.current && setState(jobsNotMounted(error) ? "absent" : "error"),
      );
  }, [api, query, refresh]);

  useEffect(() => {
    if (!live || page !== 0 || state === "absent") return;
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
  }, [api, live, page, query, state]);

  const reset = (): void => {
    setHistory([undefined]);
    setPage(0);
    setCursor(undefined);
    setNewRuns(false);
  };
  return (
    <>
      <JobsTabs />
      <div className="route-page">
        <PageHeader
          title="Runs"
          description="Bounded native run history with explicit jobs service availability."
          badges={
            state === "ready" ? (
              <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground tabular-nums">
                {items.length} shown
              </span>
            ) : null
          }
          actions={
            <>
              <label className="inline-flex h-8 cursor-default items-center gap-2 rounded-md border border-border bg-card px-2.5 text-xs text-muted-foreground select-none">
                <input
                  checked={live}
                  className="size-3.5 accent-[var(--live)]"
                  onChange={(event) => setLive(event.target.checked)}
                  type="checkbox"
                />
                <span
                  aria-hidden="true"
                  className={
                    live && state !== "absent"
                      ? "neon-status-breathe size-1.5 rounded-[1px] bg-live text-live"
                      : "size-1.5 rounded-[1px] bg-muted-foreground/50"
                  }
                />
                Live refresh
              </label>
              <Button
                variant={newRuns ? "default" : "secondary"}
                size="sm"
                onPress={() => {
                  if (newRuns) reset();
                  setRefresh((value) => value + 1);
                }}
              >
                <RefreshCw aria-hidden="true" />
                {newRuns ? "Show new runs" : "Refresh"}
              </Button>
            </>
          }
        />
        {state === "absent" ? null : (
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
        )}
        {(partial || availability.some((item) => item.state === "unavailable")) && (
          <Notice>Some jobs services are unavailable; this page is partial.</Notice>
        )}
        {newRuns && (
          <Notice>
            New runs are available. Refresh to update this page without changing your selected
            history.
          </Notice>
        )}
        <RunsTable items={items} state={state} />
        {state === "absent" ? null : (
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
        )}
      </div>
    </>
  );
}

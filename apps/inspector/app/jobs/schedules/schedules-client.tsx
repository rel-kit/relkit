"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { InspectorObject } from "../../../lib/api-types";
import { jobsNotMounted, NO_JOBS_MESSAGE } from "../../../lib/api-request-utils";
import { createInspectorClient } from "../../../lib/client";
import { CalendarClock, Pause, Play, Trash2 } from "lucide-react";
import { FailedState, LoadingRows } from "../../../components/blocks/block-state";
import { PageHeader } from "../../../components/blocks/page-header";
import { EmptyState } from "../../../components/neon/empty-state";
import { StatusBadge, statusTone } from "../../../components/neon/status-badge";
import { Button } from "../../../components/ui/button";
import {
  DataTable,
  DataTableCell,
  DataTableEmpty,
  DataTableHead,
} from "../../../components/ui/table";
import { Notice, record, text } from "../job-format";
import { JobsTabs } from "../jobs-tabs";
import { RunsPagination } from "../runs/runs-pagination";

export function JobsSchedulesClient() {
  const api = useMemo(() => createInspectorClient(), []);
  const [items, setItems] = useState<readonly InspectorObject[]>([]);
  const [availability, setAvailability] = useState<readonly InspectorObject[]>([]);
  const [cursor, setCursor] = useState<string>();
  const [history, setHistory] = useState<readonly (string | undefined)[]>([undefined]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string>();
  const [state, setState] = useState<"loading" | "ready" | "error" | "absent">("loading");
  const [pending, setPending] = useState("");
  const load = useCallback(async (): Promise<void> => {
    setState("loading");
    try {
      const result = await api.jobSchedules<InspectorObject>(
        cursor === undefined ? {} : { cursor },
      );
      setItems(result.items);
      setAvailability(result.availability);
      setHasMore(result.hasMore);
      setNextCursor(result.nextCursor);
      setState("ready");
    } catch (error) {
      setState(jobsNotMounted(error) ? "absent" : "error");
    }
  }, [api, cursor]);
  useEffect(() => {
    void load();
  }, [load]);
  const action = async (
    kind: "pause" | "resume" | "delete",
    id: string,
    service: string,
  ): Promise<void> => {
    setPending(`${kind}:${id}`);
    try {
      await api.jobScheduleAction(kind, id, { service });
      await load();
    } finally {
      setPending("");
    }
  };
  return (
    <>
      <JobsTabs />
      <div className="route-page">
        <PageHeader
          title="Schedules"
          description="Native schedules and their provider-reported state."
        />
        {availability.some((item) => item.state === "unavailable") && (
          <Notice>Some jobs services are unavailable.</Notice>
        )}
        {state === "loading" && (
          <div className="rounded-lg border border-border bg-card">
            <LoadingRows label="Loading schedules…" rows={5} />
          </div>
        )}
        {state === "error" && (
          <FailedState title="Schedules are unavailable." onRetry={() => void load()} />
        )}
        {state === "absent" && (
          <EmptyState
            icon={<CalendarClock />}
            title={<span role="status">{NO_JOBS_MESSAGE}</span>}
            description="Schedules belong to job definitions; none are declared."
          />
        )}
        {state === "ready" && <ScheduleTable items={items} pending={pending} onAction={action} />}
        {state === "absent" ? null : (
          <RunsPagination
            label="Schedule pagination"
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

function ScheduleTable({
  items,
  pending,
  onAction,
}: {
  readonly items: readonly InspectorObject[];
  readonly pending: string;
  readonly onAction: (
    kind: "pause" | "resume" | "delete",
    id: string,
    service: string,
  ) => Promise<void>;
}) {
  return (
    <DataTable>
      <caption className="sr-only">Job schedules</caption>
      <thead>
        <tr>
          <DataTableHead>Schedule</DataTableHead>
          <DataTableHead>Job</DataTableHead>
          <DataTableHead>Cadence</DataTableHead>
          <DataTableHead>State</DataTableHead>
          <DataTableHead>Service</DataTableHead>
          <DataTableHead className="text-right">Controls</DataTableHead>
        </tr>
      </thead>
      <tbody>
        {items.length === 0 ? (
          <tr>
            <DataTableEmpty>No schedules are available.</DataTableEmpty>
          </tr>
        ) : (
          items.map((item, index) => {
            const schedule = record(item.schedule);
            const id = text(schedule?.id);
            const service = text(item.service);
            const state = text(schedule?.state);
            const cadence = [text(schedule?.cron), text(schedule?.timezone)]
              .filter((part) => part !== "")
              .join(" · ");
            return (
              <tr key={`${id}-${index}`} className="transition-colors hover:bg-muted/40">
                <th
                  scope="row"
                  className="border-b border-border/70 px-3 py-2 text-left font-mono text-xs font-medium"
                >
                  {id || "unknown"}
                </th>
                <DataTableCell className="font-mono text-xs">
                  {text(schedule?.jobId) || "—"}
                </DataTableCell>
                <DataTableCell className="font-mono text-xs text-muted-foreground">
                  {cadence || "—"}
                </DataTableCell>
                <DataTableCell>
                  <StatusBadge tone={statusTone(state)} label={state || "unknown"} />
                </DataTableCell>
                <DataTableCell className="font-mono text-xs text-muted-foreground">
                  {service || "—"}
                </DataTableCell>
                <DataTableCell>
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="secondary"
                      size="sm"
                      isDisabled={pending !== "" || id === ""}
                      onPress={() =>
                        void onAction(state === "paused" ? "resume" : "pause", id, service)
                      }
                    >
                      {state === "paused" ? (
                        <Play aria-hidden="true" />
                      ) : (
                        <Pause aria-hidden="true" />
                      )}
                      {pending === `pause:${id}` || pending === `resume:${id}`
                        ? "Requesting…"
                        : state === "paused"
                          ? "Resume"
                          : "Pause"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      isDisabled={pending !== "" || id === ""}
                      onPress={() => void onAction("delete", id, service)}
                    >
                      <Trash2 aria-hidden="true" /> Delete
                    </Button>
                  </div>
                </DataTableCell>
              </tr>
            );
          })
        )}
      </tbody>
    </DataTable>
  );
}

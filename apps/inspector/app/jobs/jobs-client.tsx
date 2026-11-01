"use client";

import { useCallback, useState } from "react";
import {
  INSPECTOR_API_PROTOCOL,
  INSPECTOR_API_VERSION,
  type InspectorObject,
  type InspectorPage,
  type InspectorQuery,
} from "../../lib/api-types";
import { jobsNotMounted, NO_JOBS_MESSAGE } from "../../lib/api-request-utils";
import { createInspectorClient } from "../../lib/client";
import {
  itemsForJob,
  JOB_STATES,
  queueCounts,
  RUN_STATES,
  runCounts,
  type JobQueueCounts,
  type JobRunCounts,
} from "../../lib/jobs-model";
import { Briefcase, RefreshCw } from "lucide-react";
import { DetailList } from "../../components/blocks/details";
import { PageHeader } from "../../components/blocks/page-header";
import { EmptyState } from "../../components/neon/empty-state";
import { Button } from "../../components/ui/button";
import { ResourceTable, type ResourceTableItem } from "../resource-table";
import { StateCounts } from "./job-format";

interface JobItem extends ResourceTableItem {
  readonly target: string;
  readonly counts: JobQueueCounts | JobRunCounts;
  readonly legacy: boolean;
}

const statusOptions = [...new Set([...RUN_STATES, ...JOB_STATES])].map((id) => ({
  id,
  label: id,
}));

export function JobsClient() {
  const [absent, setAbsent] = useState(false);
  const load = useCallback(async (query: InspectorQuery): Promise<InspectorPage<JobItem>> => {
    const api = createInspectorClient();
    const { status, cursor: _cursor, ...runQuery } = query;
    const definitionQuery = runQuery;
    try {
      const [jobs, runs] = await Promise.all([
        api.jobDefinitions<InspectorObject>(definitionQuery),
        api.jobRuns<InspectorObject>({ ...runQuery, limit: Math.min(query.limit ?? 25, 100) }),
      ]);
      setAbsent(false);
      return rows(jobs, runs.items, status, false);
    } catch (error) {
      // An unmounted task-first API can still mean an older runtime that serves legacy jobs,
      // so "no jobs" is only concluded once the legacy collection is empty or unavailable too.
      const notMounted = jobsNotMounted(error);
      const none = (): InspectorPage<JobItem> => {
        setAbsent(true);
        return { protocol: INSPECTOR_API_PROTOCOL, version: INSPECTOR_API_VERSION, items: [] };
      };
      try {
        const [jobs, runtime] = await Promise.all([
          api.list<InspectorObject>("jobs", definitionQuery),
          api.runtimeList<InspectorObject>("jobs", {
            ...runQuery,
            limit: Math.min(query.limit ?? 25, 100),
          }),
        ]);
        if (
          notMounted &&
          jobs.items.length === 0 &&
          (await api.list<InspectorObject>("jobs", { limit: 1 })).items.length === 0
        )
          return none();
        setAbsent(false);
        return rows(jobs, runtime.items, status, true);
      } catch (legacyError) {
        if (notMounted) return none();
        throw legacyError;
      }
    }
  }, []);

  if (absent)
    return (
      <div className="route-page">
        <PageHeader
          title="Jobs"
          description="Inspect durable definitions and bounded run summaries without loading full history."
          actions={
            <Button
              variant="ghost"
              size="sm"
              aria-label="Refresh jobs"
              onPress={() => setAbsent(false)}
            >
              <RefreshCw aria-hidden="true" />
              Refresh
            </Button>
          }
        />
        <EmptyState
          size="lg"
          icon={<Briefcase />}
          title={<span role="status">{NO_JOBS_MESSAGE}</span>}
          description="Jobs run tasks in the background, on a schedule or on demand. Declare a job and its definitions, runs, schedules and services appear here."
        />
      </div>
    );
  return (
    <ResourceTable
      title="Jobs"
      description="Inspect durable definitions and bounded run summaries without loading full history."
      noun="jobs"
      load={load}
      statusOptions={statusOptions}
      columns={[
        {
          key: "target",
          label: "Task / target",
          render: (item) => (
            <code className="font-mono text-xs text-foreground/90">{item.target}</code>
          ),
        },
        {
          key: "runs",
          label: "Active",
          render: (item) =>
            item.legacy ? (
              <StateCounts
                counts={pick(item.counts, ["accepted", "available", "leased", "delayed"])}
                empty="Idle"
              />
            ) : (
              <StateCounts
                counts={pick(item.counts, ["queued", "delayed", "running", "sleeping", "retrying"])}
                empty="Idle"
              />
            ),
        },
        {
          key: "terminal",
          label: "Terminal",
          render: (item) =>
            item.legacy ? (
              <StateCounts counts={pick(item.counts, ["completed", "dead-lettered"])} empty="—" />
            ) : (
              <StateCounts
                counts={pick(item.counts, ["completed", "failed", "cancelled", "timed-out"])}
                empty="—"
              />
            ),
        },
      ]}
      href={(item) => `/jobs/${encodeURIComponent(item.id)}`}
      openLabel="Open job"
      details={(item) => (
        <DetailList
          columns={2}
          items={[
            { label: "Task / target", value: item.target, mono: true },
            ...Object.entries(item.counts).map(([state, count]) => ({
              label: state,
              value: <span className="tabular-nums">{count}</span>,
            })),
          ]}
        />
      )}
    />
  );
}

function rows(
  jobs: InspectorPage<InspectorObject>,
  items: readonly InspectorObject[],
  status: string | undefined,
  legacy: boolean,
): InspectorPage<JobItem> {
  const ids = jobs.items.flatMap((job) => {
    const id = text(job.jobId) || text(job.id);
    return id === "" ? [] : [id];
  });
  return {
    ...jobs,
    items: jobs.items.flatMap((job) => {
      const id = text(job.id);
      const jobId = text(job.jobId) || id;
      const matching = itemsForJob(items, jobId, ids);
      if (status !== undefined && matching.length === 0) return [];
      return [
        {
          id,
          target: legacy
            ? text(job.targetFunctionId) || "function unavailable"
            : text(job.taskId) || "task unavailable",
          counts: legacy ? queueCounts(matching) : runCounts(matching),
          legacy,
        },
      ];
    }),
  };
}

function pick(
  counts: JobQueueCounts | JobRunCounts,
  keys: readonly string[],
): Record<string, number> {
  const source = counts as Readonly<Record<string, number>>;
  return Object.fromEntries(keys.map((key) => [key, source[key] ?? 0]));
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

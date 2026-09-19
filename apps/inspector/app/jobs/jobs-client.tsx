"use client";

import { useCallback } from "react";
import type { InspectorObject, InspectorPage, InspectorQuery } from "../../lib/api-types";
import { createInspectorClient } from "../../lib/client";
import { itemsForJob, JOB_STATES, queueCounts, RUN_STATES, runCounts, type JobQueueCounts, type JobRunCounts } from "../../lib/jobs-model";
import { ResourceTable, type ResourceTableItem } from "../resource-table";

interface JobItem extends ResourceTableItem {
  readonly target: string;
  readonly counts: JobQueueCounts | JobRunCounts;
  readonly legacy: boolean;
}

const statusOptions = [...RUN_STATES, ...JOB_STATES].map((id) => ({ id, label: id }));

export function JobsClient() {
  const load = useCallback(async (query: InspectorQuery): Promise<InspectorPage<JobItem>> => {
    const api = createInspectorClient();
    const { status, cursor: _cursor, ...runQuery } = query;
    const { status: _status, ...definitionQuery } = runQuery;
    try {
      const [jobs, runs] = await Promise.all([
        api.jobDefinitions<InspectorObject>(definitionQuery),
        api.jobRuns<InspectorObject>({ ...runQuery, limit: Math.min(query.limit ?? 25, 100) }),
      ]);
      return rows(jobs, runs.items, status, false);
    } catch {
      const [jobs, runtime] = await Promise.all([
        api.list<InspectorObject>("jobs", definitionQuery),
        api.runtimeList<InspectorObject>("jobs", { ...runQuery, limit: Math.min(query.limit ?? 25, 100) }),
      ]);
      return rows(jobs, runtime.items, status, true);
    }
  }, []);

  return (
    <ResourceTable
      title="Jobs"
      description="Inspect durable definitions and bounded run summaries without loading full history."
      noun="jobs"
      load={load}
      statusOptions={statusOptions}
      columns={[
        { key: "target", label: "Task / target", render: (item) => item.target },
        {
          key: "runs",
          label: "Runs",
          render: (item) => item.legacy
            ? `Available ${(item.counts as JobQueueCounts).available} · Leased ${(item.counts as JobQueueCounts).leased} · Delayed ${(item.counts as JobQueueCounts).delayed}`
            : `Running ${(item.counts as JobRunCounts).running} · Sleeping ${(item.counts as JobRunCounts).sleeping} · Failed ${(item.counts as JobRunCounts).failed}`,
        },
        { key: "terminal", label: "Terminal", render: (item) => item.legacy ? (item.counts as JobQueueCounts)["dead-lettered"] : (item.counts as JobRunCounts).completed + (item.counts as JobRunCounts).cancelled },
      ]}
      href={(item) => `/jobs/${encodeURIComponent(item.id)}`}
      openLabel="Open job"
      details={(item) => (
        <dl className="identity-grid">
          {Object.entries(item.counts).map(([state, count]) => (
            <div key={state}>
              <dt>{state}</dt>
              <dd>{count}</dd>
            </div>
          ))}
        </dl>
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
      return [{
        id,
        target: legacy ? text(job.targetFunctionId) || "function unavailable" : text(job.taskId) || "task unavailable",
        counts: legacy ? queueCounts(matching) : runCounts(matching),
        legacy,
      }];
    }),
  };
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

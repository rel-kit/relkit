"use client";

import { useCallback } from "react";
import type { InspectorObject, InspectorPage, InspectorQuery } from "../../lib/api-types";
import { createInspectorClient } from "../../lib/client";
import { unpagedQuery } from "../../lib/list-query";
import { itemsForJob, JOB_STATES, queueCounts, type JobQueueCounts } from "../../lib/jobs-model";
import { ResourceTable, type ResourceTableItem } from "../resource-table";

interface JobItem extends ResourceTableItem {
  readonly target: string;
  readonly counts: JobQueueCounts;
}

const statusOptions = JOB_STATES.map((id) => ({ id, label: id }));

export function JobsClient() {
  const load = useCallback(async (query: InspectorQuery): Promise<InspectorPage<JobItem>> => {
    const api = createInspectorClient();
    const { status, ...graphQuery } = query;
    const [jobs, runtime] = await Promise.all([
      api.list<InspectorObject>("jobs", graphQuery),
      api.runtimeList<InspectorObject>("jobs", unpagedQuery(query)),
    ]);
    const ids = jobs.items.flatMap((job) => {
      const id = text(job.id);
      return id === "" ? [] : [id];
    });
    const items = jobs.items.flatMap((job) => {
      const id = text(job.id);
      const instances = itemsForJob(runtime.items, id, ids);
      if (status !== undefined && instances.length === 0) return [];
      return [
        {
          id,
          target: text(job.targetFunctionId) || "function unavailable",
          counts: queueCounts(instances),
        },
      ];
    });
    return { ...jobs, items };
  }, []);
  return (
    <ResourceTable
      title="Jobs"
      description="Inspect durable queue state, retry policy, schedules, and local actions."
      noun="jobs"
      load={load}
      statusOptions={statusOptions}
      columns={[
        { key: "target", label: "Target", render: (item) => item.target },
        {
          key: "queue",
          label: "Queue",
          render: (item) =>
            `Available ${item.counts.available} · Leased ${item.counts.leased} · Delayed ${item.counts.delayed}`,
        },
        { key: "dead", label: "Dead letters", render: (item) => item.counts["dead-lettered"] },
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

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

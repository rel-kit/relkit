"use client";

import { useEffect, useState } from "react";
import type { InspectorObject, InspectorPage } from "../../lib/api-types";
import { createInspectorClient } from "../../lib/client";
import { itemsForJob, queueCounts } from "../../lib/jobs-model";

export function JobsClient() {
  const [jobs, setJobs] = useState<readonly InspectorObject[]>([]);
  const [runtime, setRuntime] = useState<readonly InspectorObject[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const api = createInspectorClient();
    void Promise.all([
      api.list<InspectorObject>("jobs", { limit: 100 }),
      api.runtimeList<InspectorObject>("jobs", { limit: 100 }),
    ])
      .then(
        ([jobPage, runtimePage]: [
          InspectorPage<InspectorObject>,
          InspectorPage<InspectorObject>,
        ]) => {
          setJobs(jobPage.items);
          setRuntime(runtimePage.items);
          setState("ready");
        },
      )
      .catch(() => setState("error"));
  }, []);

  const jobIds = jobs.flatMap((job) => (text(job.id) === "" ? [] : [text(job.id)]));
  return (
    <div className="route-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">ACTIVE WORKSPACE</p>
          <h1>Jobs</h1>
          <p className="lede">
            Inspect durable queue state, retry policy, schedules, and local actions.
          </p>
        </div>
        <span className="badge">{jobs.length} jobs</span>
      </header>
      {state === "loading" && (
        <p className="panel route-state" role="status">
          Loading jobs…
        </p>
      )}
      {state === "error" && (
        <p className="panel route-state" role="alert">
          The jobs API is unavailable.
        </p>
      )}
      {state === "ready" && jobs.length === 0 && (
        <p className="panel route-state">No jobs are reported by the active graph.</p>
      )}
      {jobs.length > 0 && (
        <ul className="route-list">
          {jobs.map((job) => {
            const id = text(job.id);
            const counts = queueCounts(itemsForJob(runtime, id, jobIds));
            return <JobRow key={id} job={job} counts={counts} />;
          })}
        </ul>
      )}
    </div>
  );
}

function JobRow({
  job,
  counts,
}: {
  readonly job: InspectorObject;
  readonly counts: ReturnType<typeof queueCounts>;
}) {
  const id = text(job.id) || "job";
  return (
    <li className="panel route-row">
      <div>
        <strong>{id}</strong>
        <p className="supporting-copy">
          Target: {text(job.targetFunctionId) || "function unavailable"}
        </p>
      </div>
      <div className="route-row-detail">
        <span>Available {counts.available}</span>
        <span>Leased {counts.leased}</span>
        <span>Delayed {counts.delayed}</span>
        <span>Dead letters {counts["dead-lettered"]}</span>
      </div>
      <a className="text-link" href={`/jobs/${encodeURIComponent(id)}`}>
        Open job <span aria-hidden="true">→</span>
      </a>
    </li>
  );
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

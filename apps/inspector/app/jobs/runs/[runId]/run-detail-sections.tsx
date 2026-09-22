import Link from "next/link";
import type { InspectorObject } from "../../../../lib/api-types";

export function RunOverview({
  run,
  evidence,
  jobId,
  taskId,
  status,
}: {
  readonly run: InspectorObject;
  readonly evidence: InspectorObject | undefined;
  readonly jobId: string;
  readonly taskId: string;
  readonly status: string;
}) {
  return (
    <dl className="identity-grid">
      <div>
        <dt>Status</dt>
        <dd>{status}</dd>
      </div>
      <div>
        <dt>Job</dt>
        <dd>
          {jobId === "" ? "—" : <Link href={`/jobs/${encodeURIComponent(jobId)}`}>{jobId}</Link>}
        </dd>
      </div>
      <div>
        <dt>Task</dt>
        <dd>
          {taskId === "" ? (
            "—"
          ) : (
            <Link href={`/tasks/${encodeURIComponent(taskId)}`}>{taskId}</Link>
          )}
        </dd>
      </div>
      <div>
        <dt>Version / build</dt>
        <dd>
          {text(run.taskVersion) || "—"} / {text(run.buildId) || "—"}
        </dd>
      </div>
      <div>
        <dt>Service</dt>
        <dd>{text(run.service) || "—"}</dd>
      </div>
      <div>
        <dt>Accepted</dt>
        <dd>{text(run.acceptedAt) || "—"}</dd>
      </div>
      <div>
        <dt>Started / completed</dt>
        <dd>
          {text(run.startedAt) || "—"} / {text(run.completedAt) || "—"}
        </dd>
      </div>
      <div>
        <dt>Observed / source</dt>
        <dd>
          {text(run.observedAt) || "—"} / {text(evidence?.source) || "unknown"}
        </dd>
      </div>
      <div>
        <dt>Live evidence</dt>
        <dd>{text(evidence?.live) || "unknown"}</dd>
      </div>
      <div>
        <dt>Result availability</dt>
        <dd>{text(run.resultAvailability) || "unknown"}</dd>
      </div>
    </dl>
  );
}

export function RunJsonPanel({ value }: { readonly value: InspectorObject }) {
  return <pre className="safe-json">{JSON.stringify(value, null, 2)}</pre>;
}

export function isActive(value: string): boolean {
  return ["queued", "delayed", "running", "sleeping", "retrying"].includes(value);
}

export function record(value: unknown): InspectorObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as InspectorObject)
    : undefined;
}

export function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

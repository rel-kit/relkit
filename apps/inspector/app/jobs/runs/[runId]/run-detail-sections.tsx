import Link from "next/link";
import { CodeBlock } from "../../../../components/blocks/code-block";
import { DetailList } from "../../../../components/blocks/details";
import { StatusBadge, statusTone, type StatusTone } from "../../../../components/neon/status-badge";
import { Timeline, type TimelineItem } from "../../../../components/neon/timeline";
import type { InspectorObject } from "../../../../lib/api-types";
import { formatDuration } from "../../../../lib/format";
import { elapsed, record, stamp, text } from "../../job-format";

export { record, text };

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
  const duration = elapsed(run.startedAt, run.completedAt);
  return (
    <DetailList
      columns={3}
      items={[
        { label: "Status", value: <StatusBadge tone={statusTone(status)} label={status} /> },
        {
          label: "Job",
          mono: true,
          value:
            jobId === "" ? "—" : <Link href={`/jobs/${encodeURIComponent(jobId)}`}>{jobId}</Link>,
        },
        {
          label: "Task",
          mono: true,
          value:
            taskId === "" ? (
              "—"
            ) : (
              <Link href={`/tasks/${encodeURIComponent(taskId)}`}>{taskId}</Link>
            ),
        },
        {
          label: "Version / build",
          mono: true,
          value: `${text(run.taskVersion) || "—"} / ${text(run.buildId) || "—"}`,
        },
        { label: "Service", mono: true, value: text(run.service) || "—" },
        { label: "Duration", mono: true, value: formatDuration(duration) },
        { label: "Accepted", mono: true, value: stamp(run.acceptedAt) },
        {
          label: "Started / completed",
          mono: true,
          value: `${stamp(run.startedAt)} / ${stamp(run.completedAt)}`,
        },
        {
          label: "Observed / source",
          mono: true,
          value: `${stamp(run.observedAt)} / ${text(evidence?.source) || "unknown"}`,
        },
        { label: "Live evidence", value: text(evidence?.live) || "unknown" },
        { label: "Result availability", value: text(run.resultAvailability) || "unknown" },
      ]}
    />
  );
}

/** Lifecycle checkpoints from the retained run record, newest first. */
export function RunLifecycle({
  run,
  status,
}: {
  readonly run: InspectorObject;
  readonly status: string;
}) {
  const attempt = typeof run.attempt === "number" ? run.attempt : undefined;
  const cancellation = record(run.cancellation);
  const terminalTone = statusTone(status);
  const checkpoints: (TimelineItem & { readonly sort: number })[] = [];
  const add = (
    id: string,
    title: string,
    at: unknown,
    tone: StatusTone,
    meta?: readonly string[],
  ): void => {
    if (typeof at !== "string" || !Number.isFinite(Date.parse(at))) return;
    checkpoints.push({
      id,
      title,
      at,
      tone,
      sort: Date.parse(at),
      meta: [stamp(at), ...(meta ?? [])],
    });
  };
  add("accepted", "Accepted", run.acceptedAt, "info");
  add("scheduled", "Scheduled for", run.scheduledFor, "neutral");
  add(
    "started",
    attempt === undefined ? "Started" : `Attempt ${attempt} started`,
    run.startedAt,
    "live",
  );
  add("eligible", "Next eligible", run.nextEligibleAt, "warning");
  add(
    "cancellation",
    "Cancellation requested",
    cancellation?.requestedAt,
    "warning",
    text(cancellation?.reason) === "" ? [] : [text(cancellation?.reason)],
  );
  add(
    "completed",
    status === "completed" ? "Completed" : `Ended · ${status}`,
    run.completedAt,
    terminalTone,
    [formatDuration(elapsed(run.startedAt, run.completedAt))],
  );
  const items = checkpoints.sort((left, right) => right.sort - left.sort);
  if (items.length > 0 && text(run.completedAt) === "" && isActive(status))
    items.unshift({ id: "current", title: status, tone: "live", tag: "current", sort: Infinity });
  return <Timeline label="Run lifecycle" items={items} />;
}

export function RunJsonPanel({ value }: { readonly value: InspectorObject }) {
  return <CodeBlock value={value} label="run section" />;
}

export function isActive(value: string): boolean {
  return ["queued", "delayed", "running", "sleeping", "retrying"].includes(value);
}

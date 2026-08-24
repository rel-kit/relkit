import type { InspectorObject } from "../../lib/api-types";
import { itemsForJob, nextRunValue, queueCounts } from "../../lib/jobs-model";
import type { JobAction } from "../../lib/job-actions";
import { AttemptsPanel, QueuePanel } from "./job-state-panels";
import { SchemaPanel } from "../schema-panel";

export function JobContract({
  node,
  instances,
  knownJobIds,
  capabilities,
  pending,
  onAction,
}: {
  readonly node: InspectorObject;
  readonly instances: readonly InspectorObject[];
  readonly knownJobIds: readonly string[];
  readonly capabilities: readonly string[];
  readonly pending: boolean;
  readonly onAction: (action: JobAction, instanceId: string) => Promise<void>;
}) {
  const id = text(node.id);
  const items = itemsForJob(instances, id, knownJobIds);
  const counts = queueCounts(items);
  const schedules = records(node.schedule);
  return (
    <>
      <section className="panel route-identity" aria-labelledby="job-contract-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">JOB CONTRACT</p>
            <h2 id="job-contract-heading">{id || "Unknown job"}</h2>
          </div>
          <span className="badge">{text(node.profile) || "default"}</span>
        </div>
        <dl className="route-meta">
          <Meta label="Target function" value={text(node.targetFunctionId) || "Unavailable"} />
          <Meta label="Concurrency" value={number(node.concurrency, "provider default")} />
          <Meta label="Next run" value={formatTime(nextRunValue(node, items))} />
        </dl>
      </section>
      <div className="route-contract-grid">
        <JsonPanel title="Input schema" value={node.input} />
        <JsonPanel title="Retry policy" value={node.retry} />
      </div>
      <SchedulePanel schedules={schedules} items={items} />
      <QueuePanel counts={counts} />
      <AttemptsPanel
        items={items}
        capabilities={capabilities}
        pending={pending}
        onAction={onAction}
      />
    </>
  );
}

function SchedulePanel({
  schedules,
  items,
}: {
  readonly schedules: readonly InspectorObject[];
  readonly items: readonly InspectorObject[];
}) {
  return (
    <section className="panel" aria-labelledby="job-schedules-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">SCHEDULING</p>
          <h2 id="job-schedules-heading">Schedules</h2>
        </div>
        <span className="badge">{schedules.length}</span>
      </div>
      {schedules.length === 0 ? (
        <p className="supporting-copy">No schedules are declared.</p>
      ) : (
        <ul className="request-list">
          {schedules.map((schedule) => (
            <li className="request-row" key={text(schedule.id)}>
              <span>
                <strong>{text(schedule.id) || "schedule"}</strong>
                <br />
                <small>
                  {text(schedule.cron) || "cron unavailable"} ·{" "}
                  {text(schedule.timezone) || "timezone unavailable"}
                </small>
              </span>
              <span>Next: {formatTime(nextRunValue(schedule, items, text(schedule.id)))}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function JsonPanel({ title, value }: { readonly title: string; readonly value: unknown }) {
  return <SchemaPanel title={title} value={value} eyebrow="CONTRACT DATA" />;
}

function Meta({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function records(value: unknown): InspectorObject[] {
  return Array.isArray(value)
    ? value.filter((item): item is InspectorObject => isRecord(item))
    : [];
}

function isRecord(value: unknown): value is InspectorObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function number(value: unknown, fallback: string): string {
  return typeof value === "number" ? value.toLocaleString("en-US") : fallback;
}

function formatTime(value: unknown): string {
  if (typeof value === "number" || typeof value === "string") {
    const date = new Date(value);
    if (Number.isFinite(date.getTime())) return date.toLocaleString("en-US");
  }
  return "Not reported";
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

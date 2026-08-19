import type { InspectorObject } from "../../lib/api-types";
import { queueCounts } from "../../lib/jobs-model";
import type { JobAction } from "../../lib/job-actions";
import { JobActionButtons } from "./job-actions";

export function QueuePanel({ counts }: { readonly counts: ReturnType<typeof queueCounts> }) {
  return (
    <section className="panel" aria-labelledby="queue-state-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">QUEUE STATE</p>
          <h2 id="queue-state-heading">Current counts</h2>
        </div>
      </div>
      <dl className="overview-metrics">
        <Metric label="Accepted" value={counts.accepted} />
        <Metric label="Available" value={counts.available} />
        <Metric label="Leased" value={counts.leased} />
        <Metric label="Delayed" value={counts.delayed} />
        <Metric label="Completed" value={counts.completed} />
        <Metric label="Dead letters" value={counts["dead-lettered"]} />
      </dl>
    </section>
  );
}

export function AttemptsPanel({
  items,
  capabilities,
  pending,
  onAction,
}: {
  readonly items: readonly InspectorObject[];
  readonly capabilities: readonly string[];
  readonly pending: boolean;
  readonly onAction: (action: JobAction, instanceId: string) => Promise<void>;
}) {
  const deadLetters = items.filter((item) => text(item.state) === "dead-lettered");
  return (
    <section className="panel" aria-labelledby="job-attempts-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">DELIVERY HISTORY</p>
          <h2 id="job-attempts-heading">Attempts and dead letters</h2>
        </div>
        <span className="badge">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="supporting-copy">No queue attempts are retained.</p>
      ) : (
        <ul className="request-list">
          {items.map((item, index) => (
            <li
              className="request-row"
              key={text(item.instanceId) || text(item.id) || String(index)}
            >
              <span>
                <strong>{text(item.state) || "state unavailable"}</strong> · attempt{" "}
                {number(item.attempt, "unknown")}
                <br />
                <small>
                  {text(item.instanceId) || text(item.id) || "instance unavailable"} · accepted{" "}
                  {formatTime(item.acceptedAt)}
                </small>
                {failureMessage(item) !== "" && (
                  <>
                    <br />
                    <small>
                      {failureCode(item)}: {failureMessage(item)}
                    </small>
                  </>
                )}
              </span>
              <JobActionButtons
                item={item}
                capabilities={capabilities}
                pending={pending}
                onAction={onAction}
              />
            </li>
          ))}
        </ul>
      )}
      {deadLetters.length > 0 && (
        <p className="supporting-copy">
          Dead-letter actions require local confirmation and an advertised API capability.
        </p>
      )}
    </section>
  );
}

function Metric({ label, value }: { readonly label: string; readonly value: number }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value.toLocaleString("en-US")}</dd>
    </div>
  );
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

function isRecord(value: unknown): value is InspectorObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function failureMessage(item: InspectorObject): string {
  return isRecord(item.failure) ? text(item.failure.message) : "";
}

function failureCode(item: InspectorObject): string {
  return isRecord(item.failure) ? text(item.failure.code) : "failure";
}

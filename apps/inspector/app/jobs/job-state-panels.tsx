import { History } from "lucide-react";
import { DetailList } from "../../components/blocks/details";
import { Section } from "../../components/blocks/section";
import { EmptyState } from "../../components/neon/empty-state";
import { statusTone } from "../../components/neon/status-badge";
import { Timeline } from "../../components/neon/timeline";
import type { InspectorObject } from "../../lib/api-types";
import { queueCounts } from "../../lib/jobs-model";
import type { JobAction } from "../../lib/job-actions";
import { JobActionButtons } from "./job-actions";
import { Count, record, stamp, text } from "./job-format";

export function QueuePanel({ counts }: { readonly counts: ReturnType<typeof queueCounts> }) {
  const metric = (value: number) => (
    <span className="font-mono text-sm font-medium tabular-nums">
      {value.toLocaleString("en-US")}
    </span>
  );
  return (
    <Section title="Current counts" id="queue-state" description="Queue state">
      <DetailList
        columns={2}
        items={[
          { label: "Accepted", value: metric(counts.accepted) },
          { label: "Available", value: metric(counts.available) },
          { label: "Leased", value: metric(counts.leased) },
          { label: "Delayed", value: metric(counts.delayed) },
          { label: "Completed", value: metric(counts.completed) },
          { label: "Dead letters", value: metric(counts["dead-lettered"]) },
        ]}
      />
    </Section>
  );
}

/** Delivery history as a checkpoint rail; each attempt carries its own local actions. */
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
    <Section
      title="Attempts and dead letters"
      id="job-attempts"
      description={
        deadLetters.length > 0
          ? "Dead-letter actions require local confirmation and an advertised API capability."
          : "Delivery history"
      }
      actions={<Count value={items.length} />}
    >
      <Timeline
        label="Job attempts"
        empty={
          <EmptyState
            variant="bare"
            size="sm"
            icon={<History />}
            title="No queue attempts are retained."
          />
        }
        items={items.map((item, index) => {
          const state = text(item.state) || "state unavailable";
          const instance = text(item.instanceId) || text(item.id);
          const failure = record(item.failure);
          const accepted = text(item.acceptedAt);
          return {
            id: instance || String(index),
            title: state,
            tone: statusTone(state),
            meta: [
              `attempt ${number(item.attempt, "unknown")}`,
              instance || "instance unavailable",
              ...(accepted === "" ? [`accepted ${stamp(item.acceptedAt)}`] : []),
            ],
            ...(accepted === "" ? {} : { at: accepted }),
            detail: (
              <div className="grid gap-2 pt-1">
                {failure !== undefined && text(failure.message) !== "" ? (
                  <p className="m-0 rounded-md border border-danger/30 bg-danger-soft px-2.5 py-1.5 font-mono text-[11px] text-danger">
                    {text(failure.code) || "failure"}: {text(failure.message)}
                  </p>
                ) : null}
                <JobActionButtons
                  item={item}
                  capabilities={capabilities}
                  pending={pending}
                  onAction={onAction}
                />
              </div>
            ),
          };
        })}
      />
    </Section>
  );
}

function number(value: unknown, fallback: string): string {
  return typeof value === "number" ? value.toLocaleString("en-US") : fallback;
}

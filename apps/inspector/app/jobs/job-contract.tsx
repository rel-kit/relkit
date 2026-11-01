import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { CodeBlock } from "../../components/blocks/code-block";
import { DetailList } from "../../components/blocks/details";
import { Section } from "../../components/blocks/section";
import { EmptyState } from "../../components/neon/empty-state";
import type { InspectorObject } from "../../lib/api-types";
import { itemsForJob, nextRunValue, queueCounts } from "../../lib/jobs-model";
import type { JobAction } from "../../lib/job-actions";
import { Count, records, stamp, text } from "./job-format";
import { AttemptsPanel, QueuePanel } from "./job-state-panels";

/** Main column of the legacy queue-backed job detail. */
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
  const target = text(node.targetFunctionId);
  return (
    <>
      <Section title="Job contract" id="job-contract">
        <DetailList
          columns={3}
          items={[
            {
              label: "Target function",
              mono: true,
              value:
                target === "" ? (
                  "Unavailable"
                ) : (
                  <Link href={`/functions/${encodeURIComponent(target)}`}>{target}</Link>
                ),
            },
            { label: "Concurrency", value: number(node.concurrency, "provider default") },
            { label: "Next run", value: stamp(nextRunValue(node, items)), mono: true },
            { label: "Profile", value: text(node.profile) || "default", mono: true },
          ]}
        />
      </Section>
      <AttemptsPanel
        items={items}
        capabilities={capabilities}
        pending={pending}
        onAction={onAction}
      />
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <Section title="Input schema">
          <CodeBlock value={node.input} label="input schema" />
        </Section>
        <Section title="Retry policy">
          <CodeBlock value={node.retry} label="retry policy" />
        </Section>
      </div>
    </>
  );
}

/** Right rail of the legacy job detail: counts and schedules. */
export function JobContractAside({
  node,
  instances,
  knownJobIds,
}: {
  readonly node: InspectorObject;
  readonly instances: readonly InspectorObject[];
  readonly knownJobIds: readonly string[];
}) {
  const items = itemsForJob(instances, text(node.id), knownJobIds);
  return (
    <>
      <QueuePanel counts={queueCounts(items)} />
      <SchedulePanel schedules={records(node.schedule)} items={items} />
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
    <Section
      title="Schedules"
      id="job-schedules"
      flush
      actions={<Count value={schedules.length} />}
    >
      {schedules.length === 0 ? (
        <EmptyState
          variant="bare"
          size="sm"
          icon={<CalendarClock />}
          title="No schedules are declared."
        />
      ) : (
        <ul className="m-0 list-none p-0">
          {schedules.map((schedule) => (
            <li
              className="grid gap-0.5 border-b border-border/60 px-4 py-2.5 last:border-b-0"
              key={text(schedule.id)}
            >
              <span className="font-mono text-xs font-medium text-foreground">
                {text(schedule.id) || "schedule"}
              </span>
              <span className="font-mono text-[11px] text-muted-foreground">
                {text(schedule.cron) || "cron unavailable"} ·{" "}
                {text(schedule.timezone) || "timezone unavailable"}
              </span>
              <span className="text-[11px] text-muted-foreground">
                Next{" "}
                <span className="font-mono tabular-nums text-foreground/80">
                  {stamp(nextRunValue(schedule, items, text(schedule.id)))}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function number(value: unknown, fallback: string): string {
  return typeof value === "number" ? value.toLocaleString("en-US") : fallback;
}

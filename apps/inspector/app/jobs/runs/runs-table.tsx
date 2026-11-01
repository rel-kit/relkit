import { Briefcase, History } from "lucide-react";
import { FailedState, LoadingRows } from "../../../components/blocks/block-state";
import { Section } from "../../../components/blocks/section";
import { EmptyState } from "../../../components/neon/empty-state";
import { HistoryList, type HistoryEntry } from "../../../components/neon/history-list";
import { statusTone } from "../../../components/neon/status-badge";
import type { InspectorObject } from "../../../lib/api-types";
import { NO_JOBS_MESSAGE } from "../../../lib/api-request-utils";
import { middleTruncate } from "../../../lib/format";
import { elapsed, text } from "../job-format";

/** QueryHistory-style run history: status icon, job lead, mono run id, chips, duration, age. */
export function RunsTable({
  items,
  state,
}: {
  readonly items: readonly InspectorObject[];
  readonly state: "loading" | "ready" | "error" | "absent";
}) {
  if (state === "absent")
    return (
      <EmptyState
        icon={<Briefcase />}
        title={<span role="status">{NO_JOBS_MESSAGE}</span>}
        description="Declare a job in the application and its runs appear here as they are accepted."
      />
    );
  if (state === "error")
    return (
      <FailedState
        title="The run history is unavailable."
        description="The jobs service did not answer; filters and the selected page are kept."
      />
    );
  return (
    <Section
      flush
      title="Run history"
      description="Newest first · links open the retained run record"
    >
      {state === "loading" ? (
        <LoadingRows label="Loading runs…" rows={8} />
      ) : items.length === 0 ? (
        <EmptyState
          variant="bare"
          size="sm"
          icon={<History />}
          title="No runs match these filters."
          description="Clear a filter or widen the accepted window."
        />
      ) : (
        <HistoryList label="Job runs" entries={items.map(entry)} />
      )}
    </Section>
  );
}

function entry(item: InspectorObject, index: number): HistoryEntry {
  const id = text(item.runId);
  const status = text(item.status) || "unknown";
  const attempt = typeof item.attempt === "number" ? item.attempt : undefined;
  const service = text(item.service);
  const durationMs =
    typeof item.durationMs === "number"
      ? item.durationMs
      : elapsed(item.startedAt, item.completedAt);
  const at = text(item.acceptedAt);
  return {
    id: id || `run-${index}`,
    tone: statusTone(status),
    statusLabel: `Status ${status}`,
    lead: middleTruncate(text(item.jobId) || "job", 32),
    title: id || "unknown",
    meta: [
      status,
      ...(attempt === undefined ? [] : [`attempt ${attempt}`]),
      ...(service === "" ? [] : [service]),
    ],
    ...(at === "" ? {} : { at }),
    ...(durationMs === undefined ? {} : { durationMs }),
    ...(id === "" ? {} : { href: `/jobs/runs/${encodeURIComponent(id)}` }),
    attributes: { "data-status": status },
  };
}

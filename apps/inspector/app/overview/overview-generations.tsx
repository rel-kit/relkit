"use client";

import { GitCommitVertical } from "lucide-react";
import type { ReactNode } from "react";
import { FailedState, LoadingRows } from "../../components/blocks/block-state";
import { Section } from "../../components/blocks/section";
import { EmptyState } from "../../components/neon/empty-state";
import { Timeline, type TimelineItem } from "../../components/neon/timeline";
import { formatDuration, formatTimestamp } from "../../lib/format";
import { generationHistory, type GenerationGroup } from "../../lib/overview-generations";
import type { ApplicationSession } from "../../lib/stream-application";
import type { SampleState } from "./use-overview-signals";

/** Development sessions, reloads, restarts and failed reloads, newest first, grouped by run. */
export function GenerationHistory({
  generations,
  generationId,
  application,
}: {
  readonly generations: SampleState;
  readonly generationId?: string;
  /** The Inspector's session with the application: only a connected session has a current run. */
  readonly application: ApplicationSession;
}) {
  const groups = generationHistory(generations.items, 8, {
    state: application.state,
  });
  return (
    <Section
      id="overview-generations"
      title="Generation history"
      actions={<GitCommitVertical aria-hidden="true" className="size-3.5 text-muted-foreground" />}
    >
      {generations.state === "loading" && generations.items.length === 0 ? (
        <LoadingRows label="Loading generation history" rows={4} className="p-0" />
      ) : generations.state === "error" && generations.items.length === 0 ? (
        <FailedState
          title="Generation history is unavailable."
          description="Development logs could not be read."
        />
      ) : groups.length === 0 ? (
        <EmptyState
          variant="bare"
          size="sm"
          title="No reloads recorded"
          description="Generations appear here when relkit dev activates a build."
        />
      ) : (
        <div className="flex min-w-0 flex-col gap-3">
          {groups.map((group, index) => (
            <RunGroup
              key={group.runId ?? `run-${index}`}
              group={group}
              labelled={groups.length > 1 || group.runId !== undefined || group.current}
              {...(generationId === undefined ? {} : { generationId })}
            />
          ))}
        </div>
      )}
    </Section>
  );
}

function RunGroup({
  group,
  labelled,
  generationId,
}: {
  readonly group: GenerationGroup;
  readonly labelled: boolean;
  readonly generationId?: string;
}) {
  const heading = group.current
    ? group.startedAt === undefined
      ? "Current development session, start not retained"
      : `Current development session, started ${formatTimestamp(group.startedAt)}`
    : group.runId === undefined
      ? "Earlier sessions"
      : group.startedAt === undefined
        ? "Development session"
        : `Development session started ${formatTimestamp(group.startedAt)}`;
  const items: TimelineItem[] = group.entries.map((entry) => {
    const failed = entry.state === "failed";
    const meta: ReactNode[] = [
      ...(entry.version === undefined ? [] : [`v${entry.version}`]),
      ...(entry.current && generationId !== undefined ? [generationId] : []),
      ...(entry.durationMs === undefined ? [] : [`built in ${formatDuration(entry.durationMs)}`]),
    ];
    return {
      id: entry.id,
      title: entry.title,
      tone: failed
        ? "danger"
        : entry.current
          ? "live"
          : entry.state === "active"
            ? "success"
            : "neutral",
      meta,
      ...(entry.current ? { tag: "current" } : {}),
      ...(entry.at === undefined ? {} : { at: entry.at }),
      ...(entry.cause === undefined
        ? {}
        : {
            detail: (
              <span className="block font-mono whitespace-pre-line">{entry.cause.join("\n")}</span>
            ),
          }),
      ...(failed ? { href: "/diagnostics" } : {}),
    };
  });
  const label = labelled ? heading : "Generation history";
  return (
    <div className="min-w-0">
      {labelled ? (
        <h3 className="m-0 mb-1.5 text-[11px] font-medium text-muted-foreground">{heading}</h3>
      ) : null}
      {items.length === 0 ? (
        <p className="m-0 text-xs text-muted-foreground">
          This session is connected, but the history holds none of its generation events.
        </p>
      ) : (
        <Timeline label={label} items={items} />
      )}
    </div>
  );
}

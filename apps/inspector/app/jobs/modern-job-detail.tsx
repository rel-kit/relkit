"use client";

import { Briefcase, History, RotateCcw, X } from "lucide-react";
import Link from "next/link";
import { CodeBlock } from "../../components/blocks/code-block";
import { DetailList } from "../../components/blocks/details";
import { FailedState } from "../../components/blocks/block-state";
import { Section } from "../../components/blocks/section";
import { EmptyState } from "../../components/neon/empty-state";
import { HistoryList, type HistoryEntry } from "../../components/neon/history-list";
import { StatusBadge, statusTone } from "../../components/neon/status-badge";
import { Button } from "../../components/ui/button";
import type { InspectorObject } from "../../lib/api-types";
import type { JobAction } from "../../lib/job-actions";
import { DetailLayout } from "../detail-layout";
import { Count, elapsed, text } from "./job-format";

export function ModernJobDetail({
  actionError,
  definition,
  runs,
  onAction,
  pending,
}: {
  readonly actionError: string;
  readonly definition: InspectorObject;
  readonly runs: readonly InspectorObject[];
  readonly onAction: (action: JobAction, runId: string) => Promise<void>;
  readonly pending: boolean;
}) {
  const taskId = text(definition.taskId);
  const jobId = text(definition.jobId) || text(definition.id);
  const schedules = Array.isArray(definition.schedules) ? definition.schedules : [];
  const health = text(definition.health) || "unknown";
  const binding =
    definition.implicit === true
      ? "implicit"
      : definition.default === true
        ? "default"
        : "explicit";
  const entries: HistoryEntry[] = runs.map((run, index) => {
    const id = text(run.runId);
    const status = text(run.status) || "unknown";
    const accepted = text(run.acceptedAt);
    const durationMs = elapsed(run.startedAt, run.completedAt);
    return {
      id: id || `run-${index}`,
      tone: statusTone(status),
      statusLabel: `Status ${status}`,
      title: id || "unknown",
      meta: [
        status,
        ...(typeof run.attempt === "number" ? [`attempt ${run.attempt}`] : []),
        ...(text(run.service) === "" ? [] : [text(run.service)]),
      ],
      ...(accepted === "" ? {} : { at: accepted }),
      ...(durationMs === undefined ? {} : { durationMs }),
      ...(id === "" ? {} : { href: `/jobs/runs/${encodeURIComponent(id)}` }),
      attributes: { "data-status": status },
    };
  });
  const runStatus = new Map(runs.map((run) => [text(run.runId), text(run.status)]));
  return (
    <DetailLayout
      header={{
        kicker: "Job definition",
        title: text(definition.name) || jobId || "Job",
        icon: <Briefcase />,
        description: "Durable definition identity stays separate from retained run history.",
        badges: (
          <>
            <StatusBadge tone={statusTone(health)} label={health} />
            {definition.retired === true ? <StatusBadge tone="warning" label="retired" /> : null}
          </>
        ),
        meta: <span>{jobId}</span>,
      }}
      aside={
        <>
          <Section title="Definition">
            <DetailList
              items={[
                { label: "Binding", value: binding },
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
                  value: `${text(definition.taskVersion) || "—"} / ${text(definition.buildId) || "—"}`,
                },
                {
                  label: "Service",
                  mono: true,
                  value: `${text(definition.service) || "—"} (${text(definition.serviceGeneration) || "current"})`,
                },
                { label: "Execution", value: text(definition.execution) || "unknown" },
                { label: "Retired", value: definition.retired === true ? "yes" : "no" },
                {
                  label: "Schedules",
                  value: <span className="tabular-nums">{schedules.length}</span>,
                },
              ]}
            />
          </Section>
          {taskId !== "" && (
            <Link
              href={`/tasks/${encodeURIComponent(taskId)}`}
              className="text-xs text-muted-foreground no-underline hover:text-foreground hover:underline"
            >
              Open task detail →
            </Link>
          )}
        </>
      }
    >
      {actionError !== "" && <FailedState title={actionError} />}
      <Section
        title={<span id="job-runs-heading">Recent runs</span>}
        aria-labelledby="job-runs-heading"
        flush
        actions={<Count value={runs.length} />}
      >
        {entries.length === 0 ? (
          <EmptyState
            variant="bare"
            size="sm"
            icon={<History />}
            title="No history exists for this definition."
          />
        ) : (
          <HistoryList
            label="Recent runs"
            entries={entries}
            actions={(entry) => {
              const id = entry.href === undefined ? "" : entry.title;
              const active = isActive(runStatus.get(String(id)) ?? "");
              return (
                <div
                  role="group"
                  aria-label={`Actions for run ${String(id)}`}
                  className="flex gap-1"
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    isDisabled={pending || !active || id === ""}
                    onPress={() => void onAction("cancel", String(id))}
                  >
                    <X aria-hidden="true" /> Cancel
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    isDisabled={pending || active || id === ""}
                    onPress={() => void onAction("retry", String(id))}
                  >
                    <RotateCcw aria-hidden="true" /> Retry
                  </Button>
                </div>
              );
            }}
          />
        )}
      </Section>
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <Section title="Task schema">
          <CodeBlock value={definition.schema} label="task schema" />
        </Section>
        <Section title="Policy, resources & capabilities">
          <CodeBlock
            label="policy"
            value={{
              policy: definition.policy,
              resources: definition.resources,
              capabilities: definition.capabilities,
              worker: definition.worker,
            }}
          />
        </Section>
      </div>
    </DetailLayout>
  );
}

function isActive(value: string): boolean {
  return ["queued", "delayed", "running", "sleeping", "retrying"].includes(value);
}

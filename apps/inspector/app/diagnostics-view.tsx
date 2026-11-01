"use client";

import { CircleCheck, FileCode2, GitPullRequestDraft } from "lucide-react";
import { useState } from "react";
import { FailedState, LoadingRows } from "../components/blocks/block-state";
import { DetailList } from "../components/blocks/details";
import { PageHeader } from "../components/blocks/page-header";
import { EmptyState } from "../components/neon/empty-state";
import { SegmentedFilter } from "../components/neon/history-list";
import { StatusBadge, statusTone, type StatusTone } from "../components/neon/status-badge";
import type {
  DiagnosticView,
  DiagnosticsSnapshot,
  GenerationView,
} from "../lib/env-diagnostics-model";
import {
  groupDiagnostics,
  SEVERITIES,
  severityCounts,
  type DiagnosticGrouping,
  type Severity,
  type SeverityFilter,
} from "../lib/overview-diagnostics";
import { cn } from "../lib/utils";
import { HeadedSection } from "./overview/headed-section";
import { SourceLink } from "./source-link";

const severityTone: Record<Severity, StatusTone> = {
  error: "danger",
  warning: "warning",
  info: "info",
};

const severityPlural: Record<Severity, string> = {
  error: "errors",
  warning: "warnings",
  info: "info",
};

export function DiagnosticsView({
  snapshot,
  state,
  liveState,
  onRetry,
}: {
  readonly snapshot: DiagnosticsSnapshot | undefined;
  readonly state: "loading" | "ready" | "error";
  readonly liveState: string;
  readonly onRetry?: () => void;
}) {
  const [filter, setFilter] = useState<SeverityFilter>("all");
  const [grouping, setGrouping] = useState<DiagnosticGrouping>("severity");
  const all = [...(snapshot?.active.items ?? []), ...(snapshot?.candidate?.items ?? [])];
  const counts = severityCounts(all);

  return (
    <div className="route-page">
      <PageHeader
        title="Diagnostics"
        description="Candidate failures stay visible without replacing the last-known-good active generation."
        badges={
          <span className="inline-flex items-center gap-2" role="status" aria-live="polite">
            <StatusBadge tone={statusTone(liveState)} label={`live: ${liveState}`} />
            {state === "loading" && (
              <span className="text-[11px] text-muted-foreground">Refreshing diagnostics…</span>
            )}
          </span>
        }
        actions={
          <SegmentedFilter
            label="Group diagnostics by"
            value={grouping}
            onChange={setGrouping}
            options={[
              { value: "severity", label: "Severity" },
              { value: "source", label: "Source" },
            ]}
          />
        }
      />

      {state === "error" && (
        <FailedState
          title="The diagnostics API is unavailable."
          description="Previously loaded active and candidate data remains visible."
          {...(onRetry === undefined ? {} : { onRetry })}
        />
      )}
      {state === "loading" && snapshot === undefined && (
        <LoadingRows label="Loading diagnostics" rows={5} />
      )}

      {snapshot !== undefined && (
        <SeveritySummary
          counts={counts}
          total={all.length}
          filter={filter}
          onFilter={setFilter}
          candidate={snapshot.candidate?.identity}
        />
      )}

      {snapshot !== undefined && (
        <HeadedSection
          aria-labelledby="diagnostics-identity-heading"
          kicker="LAST KNOWN GOOD"
          title="Active generation"
          flush
          actions={
            <>
              <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                {snapshot.active.items.length} diagnostic
                {snapshot.active.items.length === 1 ? "" : "s"}
              </span>
              <StatusBadge tone="success" label={snapshot.active.identity.role} />
            </>
          }
        >
          <Identity identity={snapshot.active.identity} />
          <DiagnosticGroups
            items={snapshot.active.items}
            grouping={grouping}
            filter={filter}
            empty="No active-generation diagnostics are reported."
          />
        </HeadedSection>
      )}

      {snapshot?.candidate !== undefined && (
        <HeadedSection
          aria-labelledby="candidate-diagnostics-heading"
          kicker="CANDIDATE OVERLAY"
          title="Candidate diagnostics"
          flush
          className={cn(
            candidateTone(snapshot.candidate.identity, snapshot.status) === "danger" &&
              "border-danger/40",
          )}
          actions={
            <StatusBadge
              tone={candidateTone(snapshot.candidate.identity, snapshot.status)}
              label={snapshot.status}
            />
          }
        >
          <Identity identity={snapshot.candidate.identity} />
          <DiagnosticGroups
            items={snapshot.candidate.items}
            grouping={grouping}
            filter={filter}
            empty="No diagnostics are reported for the candidate."
          />
        </HeadedSection>
      )}
      {snapshot?.candidate === undefined && snapshot !== undefined && (
        <EmptyState
          size="sm"
          icon={<GitPullRequestDraft />}
          title="No candidate generation is currently being evaluated."
          description="A rejected reload shows its diagnostics here, beside the active generation."
        />
      )}
    </div>
  );
}

function candidateTone(identity: GenerationView, status: string): StatusTone {
  const tone = statusTone(identity.status ?? identity.state ?? "");
  return tone === "neutral" ? statusTone(status === "candidate" ? "pending" : status) : tone;
}

/** Inbox-style severity chips: the counts double as a filter for both generations. */
function SeveritySummary({
  counts,
  total,
  filter,
  onFilter,
  candidate,
}: {
  readonly counts: Readonly<Record<Severity, number>>;
  readonly total: number;
  readonly filter: SeverityFilter;
  readonly onFilter: (value: SeverityFilter) => void;
  readonly candidate: GenerationView | undefined;
}) {
  const chip = (value: SeverityFilter, label: string, count: number, tone?: StatusTone) => {
    const active = filter === value;
    return (
      <button
        key={value}
        type="button"
        aria-pressed={active}
        onClick={() => onFilter(active && value !== "all" ? "all" : value)}
        className={cn(
          "inline-flex h-8 min-w-0 items-center gap-2 rounded-md border px-2.5 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
          active
            ? "border-foreground/30 bg-muted text-foreground"
            : "border-border bg-card text-muted-foreground hover:text-foreground",
        )}
      >
        {tone ? (
          <span
            aria-hidden="true"
            className={cn(
              "size-1.5 rounded-[1px]",
              tone === "danger" ? "bg-danger" : tone === "warning" ? "bg-warning" : "bg-info",
            )}
          />
        ) : null}
        <span
          className={cn(
            "font-mono text-[13px] font-semibold tabular-nums",
            count > 0 && tone === "danger" && "text-danger",
            count > 0 && tone === "warning" && "text-warning",
            (count === 0 || tone === undefined || tone === "info") && "text-foreground",
          )}
        >
          {count}
        </span>
        <span>{label}</span>
      </button>
    );
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        role="group"
        aria-label="Filter diagnostics by severity"
        className="flex flex-wrap gap-2"
      >
        {chip("all", "all", total)}
        {SEVERITIES.map((severity) =>
          chip(severity, severityPlural[severity], counts[severity], severityTone[severity]),
        )}
      </div>
      <span className="ml-auto inline-flex items-center gap-2 text-[11px] text-muted-foreground">
        Candidate
        <StatusBadge
          tone={
            candidate === undefined
              ? "neutral"
              : statusTone(candidate.status ?? candidate.state ?? "pending")
          }
          label={
            candidate === undefined ? "none" : (candidate.status ?? candidate.state ?? "evaluating")
          }
        />
      </span>
    </div>
  );
}

function Identity({ identity }: { readonly identity: GenerationView }) {
  return (
    <div className="border-b border-border/60 px-4 py-3">
      <DetailList
        columns={3}
        items={[
          {
            label: "Generation ID",
            value: <span className="break-all">{identity.generationId}</span>,
            mono: true,
            copy: identity.generationId,
          },
          {
            label: "Graph hash",
            value: <span className="break-all">{identity.graphHash}</span>,
            mono: true,
            copy: identity.graphHash,
          },
          ...(identity.sourceVersion === undefined
            ? []
            : [{ label: "Source version", value: String(identity.sourceVersion), mono: true }]),
          ...(identity.state === undefined && identity.status === undefined
            ? []
            : [
                {
                  label: "Candidate status",
                  value: (
                    <StatusBadge
                      tone={statusTone(identity.status ?? identity.state)}
                      label={(identity.status ?? identity.state)!}
                    />
                  ),
                },
              ]),
        ]}
      />
    </div>
  );
}

function DiagnosticGroups({
  items,
  grouping,
  filter,
  empty,
}: {
  readonly items: readonly DiagnosticView[];
  readonly grouping: DiagnosticGrouping;
  readonly filter: SeverityFilter;
  readonly empty: string;
}) {
  if (items.length === 0)
    return (
      <p className="m-0 flex items-center gap-2 px-4 py-4 text-xs text-muted-foreground">
        <CircleCheck aria-hidden="true" className="size-3.5 text-success" />
        {empty}
      </p>
    );
  const groups = groupDiagnostics(items, grouping, filter);
  if (groups.length === 0)
    return (
      <p className="m-0 px-4 py-4 text-xs text-muted-foreground">
        No {severityPlural[filter as Severity] ?? "diagnostics"} in this generation.
      </p>
    );
  return (
    <div>
      {groups.map((group) => (
        <div key={group.id}>
          <h3 className="m-0 flex items-center gap-2 border-b border-border/60 bg-muted/40 px-4 py-1.5 text-[11px] font-medium text-muted-foreground">
            {group.severity !== undefined ? (
              <StatusBadge tone={severityTone[group.severity]} label={group.severity} />
            ) : (
              <>
                <FileCode2 aria-hidden="true" className="size-3.5" />
                <span className="min-w-0 truncate font-mono text-foreground/85">{group.label}</span>
              </>
            )}
            <span className="ml-auto font-mono tabular-nums">{group.items.length}</span>
          </h3>
          <ul className="m-0 list-none p-0">
            {group.items.map((item, index) => (
              <DiagnosticRow
                key={`${item.code}-${item.source?.file ?? "none"}-${item.source?.line ?? 0}-${index}`}
                item={item}
              />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function DiagnosticRow({ item }: { readonly item: DiagnosticView }) {
  return (
    <li className="grid gap-x-3 gap-y-1 border-b border-border/60 px-4 py-2.5 last:border-b-0 sm:grid-cols-[5.5rem_minmax(0,1fr)_auto]">
      <span className="pt-px">
        <StatusBadge tone={severityTone[item.severity]} label={item.severity} />
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <p className="m-0 flex min-w-0 flex-wrap items-baseline gap-x-2 text-[13px] text-foreground">
          <code className="bg-transparent p-0 font-mono text-xs font-semibold">{item.code}</code>
          <span className="min-w-0 break-words">{item.message}</span>
        </p>
        {(item.descriptorId !== undefined ||
          item.suggestion !== undefined ||
          item.documentationPath !== undefined) && (
          <p className="m-0 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground">
            {item.descriptorId !== undefined && (
              <span className="flex min-w-0 gap-1">
                <span>Descriptor</span>
                <span className="truncate font-mono text-foreground/85">{item.descriptorId}</span>
              </span>
            )}
            {item.suggestion !== undefined && (
              <span className="flex min-w-0 gap-1">
                <span>Suggestion</span>
                <span className="min-w-0 text-foreground/85">{item.suggestion}</span>
              </span>
            )}
            {item.documentationPath !== undefined && (
              <span className="flex min-w-0 gap-1">
                <span>Docs</span>
                <span className="truncate font-mono text-foreground/85">
                  {item.documentationPath}
                </span>
              </span>
            )}
          </p>
        )}
      </div>
      <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground sm:text-right">
        {item.source !== undefined ? <SourceLink source={item.source} /> : "no location"}
      </span>
    </li>
  );
}

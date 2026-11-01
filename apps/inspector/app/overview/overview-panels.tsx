"use client";

import {
  AlertTriangle,
  ArrowRight,
  Bot,
  GitCommitVertical,
  Inbox,
  Layers3,
  MessagesSquare,
  Network,
  Radio,
  Route,
  SquareFunction,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { FailedState, LoadingRows } from "../../components/blocks/block-state";
import { DetailList } from "../../components/blocks/details";
import { Stat, StatGroup } from "../../components/blocks/stat";
import { EmptyState } from "../../components/neon/empty-state";
import { HistoryList, type HistoryEntry } from "../../components/neon/history-list";
import { StatusBadge, type StatusTone } from "../../components/neon/status-badge";
import { Timeline, type TimelineItem } from "../../components/neon/timeline";
import type { InspectorObject } from "../../lib/api-types";
import { clockTime, formatDuration } from "../../lib/format";
import type { GraphSummary } from "../../lib/graph-model";
import { historyStatusMessage } from "../../lib/history-status";
import {
  formatRate,
  generationEvents,
  requestSummary,
  requestVolume,
  storageHealth,
} from "../../lib/overview-model";
import { Section } from "../../components/blocks/section";
import type { ConnectionState } from "../overview-shell";
import type { SampleState } from "./use-overview-signals";

export const linkButtonClass =
  "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium text-foreground no-underline transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 [&_svg]:size-3.5";

const connectionTone: Record<ConnectionState, StatusTone> = {
  connecting: "live",
  connected: "success",
  reconnecting: "warning",
  offline: "danger",
};

/** One dense card answering "is everything wired up": backend, identity, history, drops. */
export function HealthStrip({
  connection = "connecting",
  generationId,
  graphHash,
  droppedEvents,
  storage,
}: {
  readonly connection?: ConnectionState;
  readonly generationId?: string;
  readonly graphHash?: string;
  readonly droppedEvents?: number;
  readonly storage: InspectorObject | undefined;
}) {
  const history = storageHealth(storage);
  const historyMessage =
    storage === undefined ? "Checking history storage." : historyStatusMessage(storage);
  const dropped =
    droppedEvents !== undefined && Number.isSafeInteger(droppedEvents) && droppedEvents > 0
      ? Math.min(droppedEvents, 999_999)
      : 0;
  return (
    <Section id="overview-health" title="Health">
      <DetailList
        columns={3}
        className="grid-cols-2 xl:grid-cols-5"
        items={[
          {
            label: "Backend",
            value: <StatusBadge tone={connectionTone[connection]} label={connection} />,
          },
          {
            label: "Active generation",
            mono: true,
            value: (
              <span data-testid="active-generation" className="block truncate">
                {generationId ?? "Awaiting active generation"}
              </span>
            ),
            ...(generationId === undefined ? {} : { copy: generationId }),
          },
          {
            label: "Graph hash",
            mono: true,
            value: (
              <span data-testid="graph-hash" className="block truncate" title={graphHash}>
                {graphHash ?? "Graph hash unavailable"}
              </span>
            ),
            ...(graphHash === undefined ? {} : { copy: graphHash }),
          },
          {
            label: "History",
            value: (
              <span className="flex min-w-0 items-center gap-2" title={historyMessage}>
                <StatusBadge tone={history.tone} label={history.label} />
                <span className="sr-only">{historyMessage}</span>
              </span>
            ),
          },
          {
            label: "Dropped events",
            mono: true,
            value: (
              <span className={dropped > 0 ? "text-warning tabular-nums" : "tabular-nums"}>
                {dropped.toLocaleString("en-US")}
              </span>
            ),
          },
        ]}
      />
    </Section>
  );
}

/** Graph and traffic KPIs; each tile opens the page it counts. */
export function KpiRow({
  counts,
  summary,
  requests,
}: {
  readonly counts: Readonly<Record<string, number>> | undefined;
  readonly summary: GraphSummary | undefined;
  readonly requests: SampleState;
}) {
  const volume = requestVolume(requests.items);
  const count = (href: string): ReactNode =>
    counts === undefined ? "—" : (counts[href] ?? 0).toLocaleString("en-US");
  const ready = requests.state === "ready";
  return (
    <StatGroup>
      <Stat
        label="Requests"
        href="/requests"
        icon={<Inbox />}
        value={ready ? `${volume.total}${requests.truncated ? "+" : ""}` : "—"}
        hint={
          ready && volume.since !== undefined
            ? `since ${clockTime(volume.since).slice(0, 8)}${requests.truncated ? " · latest 100" : ""}`
            : requests.state === "error"
              ? "request history unavailable"
              : "no requests retained"
        }
        trend={volume.perMinute}
      />
      <Stat
        label="Error rate"
        href="/requests"
        icon={<AlertTriangle />}
        tone={!ready || volume.failed === 0 ? "default" : "danger"}
        value={ready ? formatRate(volume.errorRate) : "—"}
        hint={ready ? `${volume.failed} of ${volume.total} answered 5xx` : undefined}
      />
      <Stat label="Routes" href="/routes" icon={<Route />} value={count("/routes")} />
      <Stat
        label="Functions"
        href="/functions"
        icon={<SquareFunction />}
        value={count("/functions")}
      />
      <Stat label="Domains" href="/domains" icon={<Layers3 />} value={count("/domains")} />
      <Stat
        label="Events"
        href="/events"
        icon={<Radio />}
        value={count("/events")}
        hint="events and listeners"
      />
      <Stat
        label="Channels"
        href="/channels"
        icon={<MessagesSquare />}
        value={count("/channels")}
      />
      <Stat label="Agents" href="/agents" icon={<Bot />} value={count("/agents")} />
      <Stat label="Tools" href="/tools" icon={<Wrench />} value={count("/tools")} />
      <Stat
        label="Graph nodes"
        href="/graph"
        icon={<Network />}
        value={
          summary === undefined ? (
            "—"
          ) : (
            <span data-testid="graph-node-count">{summary.nodeCount.toLocaleString("en-US")}</span>
          )
        }
        hint={
          summary === undefined ? (
            "waiting for the graph"
          ) : (
            <>
              <span data-testid="graph-declared-edge-count">
                {summary.declaredEdgeCount.toLocaleString("en-US")}
              </span>{" "}
              declared ·{" "}
              <span data-testid="graph-observed-edge-count">
                {summary.observedEdgeCount.toLocaleString("en-US")}
              </span>{" "}
              observed edges
            </>
          )
        }
      />
    </StatGroup>
  );
}

/** The newest requests as QueryHistory-style rows linking to their records. */
export function RecentRequests({ requests }: { readonly requests: SampleState }) {
  const entries: HistoryEntry[] = requests.items.slice(0, 8).map((item) => {
    const summary = requestSummary(item);
    return {
      id: summary.id,
      tone: summary.tone,
      statusLabel: summary.statusLabel,
      lead: summary.method,
      title: summary.path,
      meta: [summary.status === undefined ? summary.outcome : String(summary.status)],
      ...(summary.at === undefined ? {} : { at: summary.at }),
      ...(summary.durationMs === undefined ? {} : { durationMs: summary.durationMs }),
      ...(summary.href === undefined ? {} : { href: summary.href }),
    };
  });
  return (
    <Section
      id="overview-recent-requests"
      title="Recent requests"
      flush
      actions={
        <Link href="/requests" className={linkButtonClass}>
          View all <ArrowRight aria-hidden="true" />
        </Link>
      }
    >
      {requests.state === "loading" && requests.items.length === 0 ? (
        <LoadingRows label="Loading recent requests" rows={5} />
      ) : requests.state === "error" && requests.items.length === 0 ? (
        <FailedState
          className="m-3"
          title="Recent requests are unavailable."
          description="Request history returns when the backend reconnects."
        />
      ) : entries.length === 0 ? (
        <EmptyState
          variant="bare"
          size="sm"
          icon={<Inbox />}
          title="No requests yet"
          description="Requests appear here as the app serves them."
        />
      ) : (
        <HistoryList label="Recent requests" entries={entries} />
      )}
    </Section>
  );
}

/** Dev supervisor activations and failed reloads, newest first; the newest activation is current. */
export function GenerationHistory({
  generations,
  generationId,
}: {
  readonly generations: SampleState;
  readonly generationId?: string;
}) {
  const items: TimelineItem[] = generationEvents(generations.items, 8).map((event) => {
    const active = event.state === "active";
    const failed = event.state === "failed";
    const meta: ReactNode[] = [
      ...(event.version === undefined ? [] : [`v${event.version}`]),
      ...(event.current && generationId !== undefined ? [generationId] : []),
      ...(event.initial ? ["initial build"] : []),
      ...(event.changedFiles === undefined || event.initial
        ? []
        : [`${event.changedFiles} file${event.changedFiles === 1 ? "" : "s"} changed`]),
      ...(event.durationMs === undefined ? [] : [`built in ${formatDuration(event.durationMs)}`]),
    ];
    return {
      id: event.id,
      title: active
        ? "Generation activated"
        : failed
          ? "Reload failed"
          : `Generation ${event.state}`,
      tone: failed ? "danger" : event.current ? "live" : active ? "success" : "neutral",
      meta,
      ...(event.current ? { tag: "current" } : {}),
      ...(event.at === undefined ? {} : { at: event.at }),
      ...(failed && event.message !== undefined
        ? { detail: <span className="line-clamp-2 font-mono">{event.message}</span> }
        : {}),
      ...(failed ? { href: "/diagnostics" } : {}),
    };
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
      ) : (
        <Timeline
          label="Generation history"
          items={items}
          empty={
            <EmptyState
              variant="bare"
              size="sm"
              title="No reloads recorded"
              description="Generations appear here when relkit dev activates a build."
            />
          }
        />
      )}
    </Section>
  );
}

"use client";

import {
  AlertTriangle,
  ArrowRight,
  Bot,
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
import { Stat, StatGroup } from "../../components/blocks/stat";
import { EmptyState } from "../../components/neon/empty-state";
import { HistoryList, type HistoryEntry } from "../../components/neon/history-list";
import type { GraphSummary } from "../../lib/graph-model";
import { requestTiles, type RequestCounts } from "../../lib/overview-counts";
import { requestSummary, requestVolume } from "../../lib/overview-model";
import { Section } from "../../components/blocks/section";
import type { SampleState } from "./use-overview-signals";

export const linkButtonClass =
  "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium text-foreground no-underline transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 [&_svg]:size-3.5";

/** Graph and traffic KPIs; each tile opens the page it counts. */
export function KpiRow({
  counts,
  summary,
  requests,
  requestCounts,
}: {
  readonly counts: Readonly<Record<string, number>> | undefined;
  readonly summary: GraphSummary | undefined;
  readonly requests: SampleState;
  /** Retained totals over the whole history; undefined until counted or when not countable. */
  readonly requestCounts?: RequestCounts | undefined;
}) {
  const volume = requestVolume(requests.items);
  const tiles = requestTiles(
    { total: volume.total, failed: volume.failed, truncated: requests.truncated },
    requestCounts,
  );
  const count = (href: string): ReactNode =>
    counts === undefined ? "—" : (counts[href] ?? 0).toLocaleString("en-US");
  const ready = requests.state === "ready" || requestCounts !== undefined;
  return (
    <StatGroup>
      <Stat
        label="Requests"
        href="/requests"
        icon={<Inbox />}
        value={ready ? tiles.requests.value : "—"}
        hint={
          ready
            ? tiles.requests.hint
            : requests.state === "error"
              ? "request history unavailable"
              : "counting requests"
        }
        trend={volume.perMinute}
      />
      <Stat
        label="Error rate"
        href="/requests?status=5xx"
        icon={<AlertTriangle />}
        tone={!ready || tiles.failed === 0 ? "default" : "danger"}
        value={ready ? tiles.errorRate.value : "—"}
        hint={ready ? tiles.errorRate.hint : undefined}
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

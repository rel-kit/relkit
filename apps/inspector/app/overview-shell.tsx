import { Network } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { PageHeader } from "../components/blocks/page-header";
import { StatusBadge, type StatusTone } from "../components/neon/status-badge";
import type { InspectorObject } from "../lib/api-types";
import type { GraphSummary } from "../lib/graph-model";
import type { ActivationFingerprint } from "../lib/graph-topology-model";
import { ActivationCohort } from "./activation-cohort";
import {
  GenerationHistory,
  HealthStrip,
  KpiRow,
  linkButtonClass,
  RecentRequests,
} from "./overview/overview-panels";
import type { SampleState } from "./overview/use-overview-signals";

export type ConnectionState = "connecting" | "connected" | "reconnecting" | "offline";

export interface OverviewSnapshot {
  readonly generationId?: string;
  readonly graphHash?: string;
  readonly connection?: ConnectionState;
  readonly droppedEvents?: number;
  readonly graphSummary?: GraphSummary;
  readonly activationFingerprint?: ActivationFingerprint;
  /** Graph entity counts per destination href (`navigationCounts`). */
  readonly counts?: Readonly<Record<string, number>>;
}

export interface OverviewSignalsSnapshot {
  readonly requests: SampleState;
  readonly generations: SampleState;
  readonly storage: InspectorObject | undefined;
}

const EMPTY_SNAPSHOT: OverviewSnapshot = Object.freeze({ connection: "connecting" });
const EMPTY_SAMPLE: SampleState = Object.freeze({ items: [], truncated: false, state: "loading" });
const EMPTY_SIGNALS: OverviewSignalsSnapshot = Object.freeze({
  requests: EMPTY_SAMPLE,
  generations: EMPTY_SAMPLE,
  storage: undefined,
});

const connectionLabels: Record<ConnectionState, string> = {
  connecting: "Connecting",
  connected: "Connected",
  reconnecting: "Reconnecting",
  offline: "Offline",
};

const connectionTones: Record<ConnectionState, StatusTone> = {
  connecting: "live",
  connected: "success",
  reconnecting: "warning",
  offline: "danger",
};

function boundedLabel(value: string | undefined): string | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const label = value.trim();
  return label.length <= 96 ? label : `${label.slice(0, 48)}…${label.slice(-24)}`;
}

function droppedEventLabel(value: number | undefined): string {
  if (value === undefined || !Number.isSafeInteger(value) || value < 1)
    return "No dropped events reported";
  return `${Math.min(value, 999_999)} dropped event${value === 1 ? "" : "s"}`;
}

/** Live stream state as a status badge plus the dropped-event count. */
export function ConnectionStatus({
  state = "connecting",
  droppedEvents,
}: {
  readonly state?: ConnectionState | undefined;
  readonly droppedEvents?: number | undefined;
}) {
  return (
    <span
      className="inline-flex min-w-0 items-center gap-2"
      data-state={state}
      role="status"
      aria-live="polite"
    >
      <StatusBadge tone={connectionTones[state]} label={connectionLabels[state]} />
      <span className="truncate text-[11px] text-muted-foreground">
        {droppedEventLabel(droppedEvents)}
      </span>
    </span>
  );
}

export function OverviewShell({
  snapshot = EMPTY_SNAPSHOT,
  signals = EMPTY_SIGNALS,
  runtime,
}: {
  readonly snapshot?: OverviewSnapshot;
  readonly signals?: OverviewSignalsSnapshot;
  readonly runtime?: ReactNode;
}) {
  const generationId = boundedLabel(snapshot.generationId);
  const graphHash = boundedLabel(snapshot.graphHash);
  const appId = snapshot.graphSummary?.appId;

  return (
    <div className="overview-shell route-page">
      <PageHeader
        title="Overview"
        description={
          appId === undefined
            ? "The active generation, its capabilities and recent traffic."
            : `The active generation of ${appId}, its capabilities and recent traffic.`
        }
        badges={
          <ConnectionStatus state={snapshot.connection} droppedEvents={snapshot.droppedEvents} />
        }
        actions={
          <Link href="/graph" className={linkButtonClass}>
            <Network aria-hidden="true" /> Open graph
          </Link>
        }
      />

      <HealthStrip
        {...(snapshot.connection === undefined ? {} : { connection: snapshot.connection })}
        {...(generationId === undefined ? {} : { generationId })}
        {...(graphHash === undefined ? {} : { graphHash })}
        {...(snapshot.droppedEvents === undefined ? {} : { droppedEvents: snapshot.droppedEvents })}
        storage={signals.storage}
      />

      <KpiRow
        counts={snapshot.counts}
        summary={snapshot.graphSummary}
        requests={signals.requests}
      />

      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <RecentRequests requests={signals.requests} />
        <GenerationHistory
          generations={signals.generations}
          {...(generationId === undefined ? {} : { generationId })}
        />
      </div>

      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {runtime}
        <ActivationCohort
          graphHash={snapshot.graphHash ?? ""}
          {...(snapshot.activationFingerprint === undefined
            ? {}
            : { fingerprint: snapshot.activationFingerprint })}
        />
      </div>
    </div>
  );
}

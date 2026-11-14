import { Network } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { PageHeader } from "../components/blocks/page-header";
import { StatusBadge, type StatusTone } from "../components/neon/status-badge";
import type { InspectorObject } from "../lib/api-types";
import { missedLiveUpdatesNote } from "../lib/history-status";
import type { RequestCounts } from "../lib/overview-counts";
import type { GraphSummary } from "../lib/graph-model";
import { INITIAL_INSPECTOR_STATE, type ApplicationSession } from "../lib/stream-application";
import { applicationLabel } from "../lib/stream-application-text";
import type { ActivationFingerprint } from "../lib/graph-topology-model";
import { ActivationCohort } from "./activation-cohort";
import { APPLICATION_TONES, HealthStrip } from "./overview/overview-health";
import { GenerationHistory } from "./overview/overview-generations";
import { KpiRow, linkButtonClass, RecentRequests } from "./overview/overview-panels";
import type { SampleState } from "./overview/use-overview-signals";

export type ConnectionState = "connecting" | "connected" | "reconnecting" | "offline";

export interface OverviewSnapshot {
  readonly generationId?: string;
  readonly graphHash?: string;
  /** The browser's stream to the Inspector process. */
  readonly connection?: ConnectionState;
  /** The Inspector's session with the application. */
  readonly application?: ApplicationSession;
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
  /** Counts over every retained request; undefined until counted. */
  readonly requestCounts?: RequestCounts | undefined;
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

/**
 * Live stream state as a status badge. Gaps in the stream are missed live updates, not lost
 * records (IN-17): they get a quiet note, never a count.
 */
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
      {missedLiveUpdatesNote(droppedEvents) === undefined ? null : (
        <span className="truncate text-[11px] text-muted-foreground">
          {missedLiveUpdatesNote(droppedEvents)}
        </span>
      )}
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
  const application = snapshot.application ?? INITIAL_INSPECTOR_STATE.application;

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
          <span role="status" aria-live="polite" className="inline-flex">
            <StatusBadge
              tone={APPLICATION_TONES[application.state]}
              label={`Application ${applicationLabel(application.state)}`}
            />
          </span>
        }
        actions={
          <Link href="/graph" className={linkButtonClass}>
            <Network aria-hidden="true" /> Open graph
          </Link>
        }
      />

      <HealthStrip
        {...(snapshot.connection === undefined ? {} : { stream: snapshot.connection })}
        application={application}
        {...(generationId === undefined ? {} : { generationId })}
        {...(graphHash === undefined ? {} : { graphHash })}
        {...(snapshot.droppedEvents === undefined ? {} : { droppedEvents: snapshot.droppedEvents })}
        storage={signals.storage}
      />

      <KpiRow
        counts={snapshot.counts}
        summary={snapshot.graphSummary}
        requests={signals.requests}
        requestCounts={signals.requestCounts}
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

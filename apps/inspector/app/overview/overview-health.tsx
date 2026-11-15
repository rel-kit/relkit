"use client";

import { DetailList } from "../../components/blocks/details";
import { Section } from "../../components/blocks/section";
import { StatusBadge, type StatusTone } from "../../components/neon/status-badge";
import type { InspectorObject } from "../../lib/api-types";
import {
  historyStatusMessage,
  missedLiveUpdatesNote,
  recordsLost,
  recordsLostSentence,
} from "../../lib/history-status";
import { storageHealth } from "../../lib/overview-model";
import type { ApplicationLink, ApplicationSession } from "../../lib/stream-application";
import { applicationLabel } from "../../lib/stream-application-text";
import type { StreamConnectionState } from "../../lib/stream-protocol";

const STREAM_TONES: Record<StreamConnectionState, StatusTone> = {
  connecting: "live",
  connected: "success",
  reconnecting: "warning",
  offline: "danger",
};

export const APPLICATION_TONES: Record<ApplicationLink, StatusTone> = {
  checking: "live",
  connected: "success",
  waiting: "warning",
  unreachable: "danger",
  ambiguous: "warning",
};

const WAITING = "Waiting for a development session";

/** One dense card: the stream to the Inspector, the application session, identity, history. */
export function HealthStrip({
  stream = "connecting",
  application,
  generationId,
  graphHash,
  droppedEvents,
  storage,
}: {
  readonly stream?: StreamConnectionState;
  readonly application: ApplicationSession;
  readonly generationId?: string;
  readonly graphHash?: string;
  readonly droppedEvents?: number;
  readonly storage: InspectorObject | undefined;
}) {
  const history = storageHealth(storage);
  const historyMessage =
    storage === undefined ? "Checking history storage." : historyStatusMessage(storage);
  const lost = recordsLost(storage);
  const lostSentence = lost === undefined ? undefined : recordsLostSentence(lost);
  const toolMissed = storage?.missedLiveUpdates;
  const missed = missedLiveUpdatesNote(
    (droppedEvents ?? 0) + (typeof toolMissed === "number" ? toolMissed : 0),
  );
  const away = application.state !== "connected" && application.state !== "checking";
  return (
    <Section id="overview-health" title="Health">
      <DetailList
        columns={3}
        className="grid-cols-2 xl:grid-cols-6"
        items={[
          {
            label: "Inspector stream",
            value: <StatusBadge tone={STREAM_TONES[stream]} label={stream} />,
          },
          {
            label: "Application",
            value: (
              <StatusBadge
                data-testid="overview-application-state"
                tone={APPLICATION_TONES[application.state]}
                label={applicationLabel(application.state)}
              />
            ),
          },
          {
            label: "Active generation",
            mono: generationId !== undefined,
            value: (
              <span data-testid="active-generation" className="block truncate">
                {generationId ??
                  (application.state === "checking" ? "Checking the application" : WAITING)}
              </span>
            ),
            ...(generationId === undefined ? {} : { copy: generationId }),
          },
          {
            label: "Graph hash",
            mono: graphHash !== undefined,
            value: (
              <span data-testid="graph-hash" className="block truncate" title={graphHash}>
                {graphHash ?? (away ? "None until a session connects" : "Loading the graph")}
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
            label: "Records lost before history",
            value: (
              <span
                data-testid="records-lost"
                className="flex min-w-0 flex-col"
                title={lostSentence ?? "No records were lost before history."}
              >
                <span
                  className={
                    lost !== undefined && lost.total > 0
                      ? "font-mono text-warning tabular-nums"
                      : "font-mono tabular-nums"
                  }
                >
                  {lost === undefined ? "—" : lost.total.toLocaleString("en-US")}
                </span>
                {lost !== undefined && lost.total > 0 ? (
                  <span className="text-[11px] text-muted-foreground">
                    {lost.byApplicationProducer.toLocaleString("en-US")} by the application ·{" "}
                    {lost.byInspectionBuffer.toLocaleString("en-US")} by its buffer
                  </span>
                ) : null}
              </span>
            ),
          },
        ]}
      />
      {lostSentence === undefined && missed === undefined ? null : (
        <div className="mt-3 space-y-0.5 text-xs text-muted-foreground">
          {lostSentence === undefined ? null : <p className="m-0">{lostSentence}</p>}
          {missed === undefined ? null : (
            <p className="m-0" data-testid="missed-live-updates">
              {missed}
            </p>
          )}
        </div>
      )}
    </Section>
  );
}

/**
 * The application session as the Inspector tool reports it, for the browser fixture: the status
 * endpoint's `application` and loss counters, and a `generation.changed` with the new state on
 * every change, as the tool publishes it.
 */
import type { Hono } from "hono";
import type { ObservabilityStream } from "relkit/observability";

export interface FixtureApplicationState {
  readonly state: "connected" | "disconnected" | "ambiguous";
  readonly sessions?: readonly string[];
  readonly recordsLostBeforeHistory?: {
    readonly byApplicationProducer: number;
    readonly byInspectionBuffer: number;
  };
  readonly missedLiveUpdates?: number;
  /** Forgets the last session, as a tool that never connected to one in its run. */
  readonly neverConnected?: boolean;
}

const CONNECTED: FixtureApplicationState = { state: "connected" };

/**
 * Registers `GET /_relkit/v1/storage` and `POST /__fixture__/application`; register it before
 * any other storage route.
 * @param generationId - Generation the connected session serves.
 */
export function installApplicationFixture(
  app: Hono,
  stream: ObservabilityStream,
  generationId: string,
): void {
  let current = CONNECTED;
  let since = new Date().toISOString();
  // As the tool keeps them for its run: the last session, and when it stopped answering.
  let lastSessionId: string | null = "fixture-session";
  let lastConnectedUntil: string | null = null;
  app.get("/_relkit/v1/storage", (context) => {
    const loss = current.recordsLostBeforeHistory ?? {
      byApplicationProducer: 0,
      byInspectionBuffer: 0,
    };
    return context.json(
      {
        protocol: "relkit.observability.query",
        version: 1,
        state: "ready",
        connection: current.state,
        application: {
          state: current.state,
          sessionId: current.state === "connected" ? "fixture-session" : null,
          generationId: current.state === "connected" ? generationId : null,
          sessions: current.state === "ambiguous" ? (current.sessions ?? []) : [],
          since,
          lastSessionId,
          lastConnectedUntil,
        },
        incomplete: loss.byApplicationProducer + loss.byInspectionBuffer > 0,
        recordsLostBeforeHistory: loss,
        missedLiveUpdates: current.missedLiveUpdates ?? 0,
        dropped: loss.byInspectionBuffer,
        producerFailed: 0,
        producerDropped: loss.byApplicationProducer,
        failed: 0,
      },
      200,
      { "x-relkit-api-version": "1" },
    );
  });
  app.post("/__fixture__/application", async (context) => {
    const next = { ...CONNECTED, ...(await context.req.json<Partial<FixtureApplicationState>>()) };
    if (next.state !== current.state) since = new Date().toISOString();
    if (next.neverConnected === true) {
      lastSessionId = null;
      lastConnectedUntil = null;
    } else if (next.state === "connected") {
      lastSessionId = "fixture-session";
      lastConnectedUntil = null;
    } else if (current.state === "connected") {
      lastConnectedUntil = since;
    }
    current = next;
    stream.publish({
      type: "generation.changed",
      data: {
        state: next.state,
        sessionId: next.state === "connected" ? "fixture-session" : null,
        generationId: next.state === "connected" ? generationId : null,
      },
    });
    return context.json({ ok: true });
  });
}

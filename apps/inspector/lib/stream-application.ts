/**
 * The Inspector's three states, kept apart (IN-09, IN-10, IN-48): the browser's stream to the
 * Inspector process, the process's session with the application, and history storage. Pure, so
 * the shell's store and its tests share one reducer.
 */
import type { InspectorObject } from "./api-types";
import { historyFailed } from "./history-status";
import type { StreamConnectionState } from "./stream-protocol";

/**
 * `checking` until the Inspector has said; `waiting` when no session was ever found in this run
 * of the Inspector; `unreachable` when a session it found stopped answering.
 */
export type ApplicationLink = "checking" | "connected" | "waiting" | "unreachable" | "ambiguous";

export interface ApplicationSession {
  readonly state: ApplicationLink;
  readonly sessionId?: string;
  readonly generationId?: string;
  /** Session ids when several are running. */
  readonly sessions: readonly string[];
  /** When the current state began, as the Inspector or this page first saw it. */
  readonly since?: string;
}

export interface InspectorState {
  readonly stream: StreamConnectionState;
  readonly application: ApplicationSession;
  readonly everConnected: boolean;
  /** The last `/_relkit/v1/storage` answer: history readiness and loss counters. */
  readonly status: InspectorObject | undefined;
  readonly statusFailed: boolean;
}

export type InspectorStateAction =
  | { readonly type: "stream"; readonly state: StreamConnectionState }
  | { readonly type: "event"; readonly at: string; readonly data: unknown }
  | { readonly type: "status"; readonly at: string; readonly body: unknown }
  | { readonly type: "status-failed" };

export const INITIAL_INSPECTOR_STATE: InspectorState = Object.freeze({
  stream: "connecting",
  application: Object.freeze({ state: "checking", sessions: [] }),
  everConnected: false,
  status: undefined,
  statusFailed: false,
});

type RawState = "connected" | "disconnected" | "ambiguous";

export function reduceInspectorState(
  state: InspectorState,
  action: InspectorStateAction,
): InspectorState {
  switch (action.type) {
    case "stream":
      return action.state === state.stream ? state : { ...state, stream: action.state };
    case "status-failed":
      return { ...state, statusFailed: true };
    case "event": {
      const data = record(action.data);
      const raw = rawState(data?.state);
      if (raw === undefined) return state;
      return applyRaw(state, raw, action.at, {
        generationId: text(data?.generationId),
      });
    }
    case "status": {
      const body = record(action.body);
      const next = { ...state, status: body, statusFailed: body === undefined };
      const application = record(body?.application);
      const raw = rawState(application?.state) ?? rawState(body?.connection);
      if (raw === undefined) return next;
      return applyRaw(next, raw, text(application?.since) ?? action.at, {
        sessionId: text(application?.sessionId),
        generationId: text(application?.generationId),
        sessions: Array.isArray(application?.sessions)
          ? application.sessions.filter((item): item is string => typeof item === "string")
          : undefined,
        sinceKnown: text(application?.since) !== undefined,
        vouched: true,
        // An older tool does not say; this tab then judges from what it saw itself.
        ...(application !== undefined && "lastSessionId" in application
          ? {
              lastSession: {
                sessionId: text(application.lastSessionId),
                stoppedAt: text(application.lastConnectedUntil),
              },
            }
          : {}),
      });
    }
  }
}

function applyRaw(
  state: InspectorState,
  raw: RawState,
  at: string,
  detail: {
    readonly sessionId?: string | undefined;
    readonly generationId?: string | undefined;
    readonly sessions?: readonly string[] | undefined;
    readonly sinceKnown?: boolean;
    readonly vouched?: boolean;
    /** The tool's record of the last session of its run; absent from an older tool. */
    readonly lastSession?: {
      readonly sessionId: string | undefined;
      readonly stoppedAt: string | undefined;
    };
  },
): InspectorState {
  // The tool records the last session of its run, so every tab tells a stopped session from
  // one that never started. Without that record (an older tool) this tab goes by what it saw.
  // A new subscriber is replayed recent events, so only the status endpoint vouches that a
  // session was here; otherwise a replayed "connected" would turn "waiting" into "unreachable".
  const everConnected =
    detail.lastSession === undefined
      ? state.everConnected || (raw === "connected" && detail.vouched === true)
      : detail.lastSession.sessionId !== undefined;
  const link: ApplicationLink =
    raw === "connected"
      ? "connected"
      : raw === "ambiguous"
        ? "ambiguous"
        : everConnected
          ? "unreachable"
          : "waiting";
  const previous = state.application;
  const same = previous.state === link;
  const stoppedAt = link === "unreachable" ? detail.lastSession?.stoppedAt : undefined;
  const since = stoppedAt ?? (detail.sinceKnown || !same ? at : (previous.since ?? at));
  const sessionId =
    detail.sessionId ??
    (link === "unreachable" ? detail.lastSession?.sessionId : undefined) ??
    (link === "connected" || link === "unreachable" ? previous.sessionId : undefined);
  const generationId =
    detail.generationId ?? (link === "connected" ? previous.generationId : undefined);
  const application: ApplicationSession = {
    state: link,
    sessions: detail.sessions ?? (link === "ambiguous" ? previous.sessions : []),
    since,
    ...(sessionId === undefined ? {} : { sessionId }),
    ...(generationId === undefined ? {} : { generationId }),
  };
  return { ...state, everConnected, application };
}

/** One word for history storage, shown next to the stream and the application. */
export function historyAvailability(
  state: InspectorState,
): "checking" | "ready" | "degraded" | "unavailable" {
  if (state.statusFailed) return "unavailable";
  if (state.status === undefined) return "checking";
  return historyFailed(state.status) ? "degraded" : "ready";
}

function rawState(value: unknown): RawState | undefined {
  return value === "connected" || value === "disconnected" || value === "ambiguous"
    ? value
    : undefined;
}

function record(value: unknown): InspectorObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as InspectorObject)
    : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

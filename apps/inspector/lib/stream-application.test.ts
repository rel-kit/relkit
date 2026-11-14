import { describe, expect, test } from "bun:test";
import {
  INITIAL_INSPECTOR_STATE,
  historyAvailability,
  reduceInspectorState,
  type InspectorState,
  type InspectorStateAction,
} from "./stream-application";

const at = "2026-11-15T10:00:00.000Z";
const later = "2026-11-15T10:05:00.000Z";

function run(...actions: InspectorStateAction[]): InspectorState {
  return actions.reduce(reduceInspectorState, INITIAL_INSPECTOR_STATE);
}

function status(application: unknown, extra: Record<string, unknown> = {}) {
  return {
    type: "status" as const,
    at,
    body: { protocol: "relkit.observability.query", state: "ready", application, ...extra },
  };
}

describe("application state", () => {
  test("starts unknown, with the stream connecting", () => {
    expect(INITIAL_INSPECTOR_STATE.stream).toBe("connecting");
    expect(INITIAL_INSPECTOR_STATE.application.state).toBe("checking");
  });

  test("reads the session from the status endpoint", () => {
    const state = run(
      status({
        state: "connected",
        sessionId: "s1",
        generationId: "g1",
        sessions: [],
        since: at,
      }),
    );
    expect(state.application).toEqual({
      state: "connected",
      sessionId: "s1",
      generationId: "g1",
      sessions: [],
      since: at,
    });
  });

  test("a disconnected session that was seen connected is unreachable", () => {
    const state = run(
      status({ state: "connected", sessionId: "s1", generationId: "g1", sessions: [], since: at }),
      { type: "event", at: later, data: { state: "disconnected", generationId: null } },
    );
    expect(state.application.state).toBe("unreachable");
    expect(state.application.since).toBe(later);
    expect(state.application.sessionId).toBe("s1");
  });

  test("a session this tab saw before a reload still reads as unreachable", () => {
    const state = run(
      { type: "remembered", sessionId: "s0" },
      status({ state: "disconnected", sessionId: null, sessions: [], since: at }),
    );
    expect(state.application.state).toBe("unreachable");
    expect(state.application.sessionId).toBe("s0");
  });

  test("with no session since start it is waiting, not unreachable", () => {
    const state = run(status({ state: "disconnected", sessionId: null, sessions: [], since: at }));
    expect(state.application.state).toBe("waiting");
    expect(state.application.since).toBe(at);
  });

  test("several sessions are named", () => {
    const state = run(
      status({ state: "ambiguous", sessionId: null, sessions: ["a", "b"], since: at }),
    );
    expect(state.application.state).toBe("ambiguous");
    expect(state.application.sessions).toEqual(["a", "b"]);
  });

  test("the stream event changes the state before the status endpoint answers", () => {
    const state = run(
      { type: "event", at, data: { state: "connected", generationId: "g2" } },
      { type: "event", at: later, data: { state: "ambiguous", generationId: null } },
    );
    expect(state.application.state).toBe("ambiguous");
    expect(state.application.since).toBe(later);
  });

  test("a replayed connected event alone does not make a later stop unreachable", () => {
    // A new subscriber is replayed recent events; only the status endpoint vouches for a session.
    const state = run(
      { type: "event", at, data: { state: "connected", generationId: "g1" } },
      { type: "event", at: later, data: { state: "disconnected", generationId: null } },
    );
    expect(state.application.state).toBe("waiting");
  });

  test("a repeated event keeps the time the state began", () => {
    const state = run(
      { type: "event", at, data: { state: "disconnected", generationId: null } },
      { type: "event", at: later, data: { state: "disconnected", generationId: null } },
    );
    expect(state.application.since).toBe(at);
  });

  test("an older tool without the application field falls back to its connection", () => {
    expect(run(status(undefined, { connection: "disconnected" })).application.state).toBe(
      "waiting",
    );
    expect(run(status(undefined, { connection: "connected" })).application.state).toBe("connected");
    expect(run(status(undefined)).application.state).toBe("checking");
  });

  test("events without a state, such as a reload, change nothing", () => {
    const before = run(status({ state: "connected", sessionId: "s1", sessions: [], since: at }));
    expect(reduceInspectorState(before, { type: "event", at: later, data: {} })).toBe(before);
  });

  test("the stream state is kept apart from the application's", () => {
    const state = run(status({ state: "connected", sessionId: "s1", sessions: [], since: at }), {
      type: "stream",
      state: "reconnecting",
    });
    expect(state.stream).toBe("reconnecting");
    expect(state.application.state).toBe("connected");
  });
});

describe("history availability", () => {
  test("follows the status endpoint", () => {
    expect(historyAvailability(INITIAL_INSPECTOR_STATE)).toBe("checking");
    expect(historyAvailability(run(status(undefined)))).toBe("ready");
    expect(historyAvailability(run(status(undefined, { state: "degraded" })))).toBe("degraded");
    expect(historyAvailability(run({ type: "status-failed" }))).toBe("unavailable");
  });
});

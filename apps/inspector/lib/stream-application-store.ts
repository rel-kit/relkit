"use client";

/**
 * The one application-state source for the whole interface: fed by `generation.changed` events
 * on the tab's shared stream, and refreshed from `/_relkit/v1/storage` when the stream connects,
 * when the session changes, and on a slow interval for history and loss counters.
 */
import { useEffect, useSyncExternalStore } from "react";
import type { InspectorObject } from "./api-types";
import { createInspectorBackendStream, createInspectorClient } from "./client";
import {
  INITIAL_INSPECTOR_STATE,
  reduceInspectorState,
  type InspectorState,
  type InspectorStateAction,
} from "./stream-application";
import { liveUpdates } from "./stream-application-text";

const STATUS_INTERVAL_MS = 10_000;
const SESSION_KEY = "relkit.inspector.application.session";

let state: InspectorState = INITIAL_INSPECTOR_STATE;
const listeners = new Set<() => void>();
let users = 0;
let release: (() => void) | undefined;
let reading = false;
let readAgain = false;

function dispatch(action: InspectorStateAction): void {
  const next = reduceInspectorState(state, action);
  if (next === state) return;
  state = next;
  const session = next.application;
  if (session.state === "connected" && session.sessionId !== undefined)
    try {
      sessionStorage.setItem(SESSION_KEY, session.sessionId);
    } catch {}
  for (const listener of [...listeners]) listener();
}

/** A reload of this tab still knows that a session was here, so it says "unreachable". */
function remember(): void {
  try {
    const sessionId = sessionStorage.getItem(SESSION_KEY);
    if (sessionId) dispatch({ type: "remembered", sessionId });
  } catch {}
}

/** Re-reads the Inspector's status now; concurrent calls share one request. */
export function refreshInspectorStatus(): void {
  if (reading) {
    readAgain = true;
    return;
  }
  reading = true;
  void createInspectorClient()
    .request<InspectorObject>("/_relkit/v1/storage", {
      cache: "no-store",
      responseProtocols: ["relkit.observability.query"],
    })
    .then(
      (body) => dispatch({ type: "status", at: new Date().toISOString(), body }),
      () => dispatch({ type: "status-failed" }),
    )
    .finally(() => {
      reading = false;
      if (readAgain) {
        readAgain = false;
        refreshInspectorStatus();
      }
    });
}

function start(): () => void {
  let connected = false;
  if (!state.everConnected) remember();
  const stream = createInspectorBackendStream({
    onStateChange: (snapshot) => {
      dispatch({ type: "stream", state: snapshot.state });
      const now = snapshot.state === "connected";
      if (now && !connected) refreshInspectorStatus();
      connected = now;
    },
    onEvent: (event) => {
      if (event.type !== "generation.changed") return;
      dispatch({ type: "event", at: new Date().toISOString(), data: event.data });
      refreshInspectorStatus();
    },
  });
  stream.start();
  refreshInspectorStatus();
  const timer = setInterval(() => {
    if (document.visibilityState !== "hidden") refreshInspectorStatus();
  }, STATUS_INTERVAL_MS);
  return () => {
    clearInterval(timer);
    stream.stop();
  };
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The Inspector's stream, application and history state; every caller shares one source. */
export function useInspectorState(): InspectorState {
  useEffect(() => {
    users += 1;
    if (users === 1) release = start();
    return () => {
      users -= 1;
      if (users === 0) {
        release?.();
        release = undefined;
      }
    };
  }, []);
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => INITIAL_INSPECTOR_STATE,
  );
}

/** A history-backed page's live-update word: "paused" while the application is away. */
export function useLiveUpdates(stream: string): string {
  return liveUpdates(stream, useInspectorState().application.state);
}

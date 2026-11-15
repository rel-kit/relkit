import { createInspectorApiClient } from "./api";
import { createInspectorStream } from "./stream";
import { SharedInspectorStream, type StreamSubscriber } from "./stream-shared";

export const INSPECTOR_BACKEND_PROXY = "/_relkit/backend" as const;
export const INSPECTOR_BACKEND_CONNECTED_EVENT = "relkit:inspector-connected" as const;

export function inspectorBackendUrl(): string {
  return configuredBackendUrl() ?? INSPECTOR_BACKEND_PROXY;
}

const clients = new Map<string, ReturnType<typeof createInspectorApiClient>>();

/**
 * The tab's client for the Inspector backend. Every component asks for it, so they share one
 * cache and one set of requests under way: a page that needs the graph asks the network once.
 */
export function createInspectorClient() {
  const baseUrl = inspectorBackendUrl();
  let client = clients.get(baseUrl);
  if (client === undefined) {
    client = createInspectorApiClient({ baseUrl });
    clients.set(baseUrl, client);
  }
  return client;
}

let shared: SharedInspectorStream | undefined;

/** The tab's one stream to the Inspector process, opened by its first subscriber. */
export function sharedInspectorStream(): SharedInspectorStream {
  shared ??= new SharedInspectorStream((options) =>
    createInspectorStream({ ...options, baseUrl: inspectorBackendUrl() }),
  );
  return shared;
}

/**
 * Subscribes to the tab's shared stream. `start` joins it and `stop` leaves it; the connection
 * itself closes only when no hook listens any more.
 */
export function createInspectorBackendStream(subscriber: StreamSubscriber = {}) {
  let leave: (() => void) | undefined;
  return {
    start(): void {
      leave ??= sharedInspectorStream().subscribe(subscriber);
    },
    stop(): void {
      leave?.();
      leave = undefined;
    },
  };
}

function configuredBackendUrl(): string | undefined {
  const value = process.env.NEXT_PUBLIC_RELKIT_BACKEND_URL;
  if (typeof value !== "string" || value.trim() === "") return undefined;
  if (typeof window === "undefined" || !isLocalInspectorProxy(value)) return value;
  return INSPECTOR_BACKEND_PROXY;
}

function isLocalInspectorProxy(value: string): boolean {
  try {
    const configured = new URL(value);
    const current = new URL(window.location.href);
    return (
      configured.pathname === INSPECTOR_BACKEND_PROXY &&
      configured.port === current.port &&
      isLocalHost(configured.hostname) &&
      isLocalHost(current.hostname)
    );
  } catch {
    return false;
  }
}

function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

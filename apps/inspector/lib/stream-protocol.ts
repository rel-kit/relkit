export const STREAM_PROTOCOL = "relkit.observability.stream" as const;
export const STREAM_VERSION = 1 as const;
export const STREAM_EVENT_TYPES = [
  "request.started",
  "request.completed",
  "log.emitted",
  "span.started",
  "span.updated",
  "span.completed",
  "job.changed",
  "event.published",
  "event.delivery.changed",
  "generation.changed",
  "diagnostic.changed",
] as const;
export type StreamEventType = (typeof STREAM_EVENT_TYPES)[number];
export type StreamConnectionState = "connecting" | "connected" | "reconnecting" | "offline";
export interface StreamEvent<T = unknown> {
  readonly protocol: typeof STREAM_PROTOCOL;
  readonly version: typeof STREAM_VERSION;
  readonly cursor: string;
  readonly type: StreamEventType;
  readonly data: T;
}
export interface StreamSnapshot {
  readonly state: StreamConnectionState;
  readonly cursor: string | undefined;
  readonly droppedEvents: number;
  readonly reconnectAttempt: number;
  readonly error: import("./api").InspectorApiError | undefined;
}
export interface CursorStorage {
  readonly getItem: (key: string) => string | null;
  readonly setItem: (key: string, value: string) => void;
  readonly removeItem: (key: string) => void;
}
export interface InspectorStreamOptions {
  readonly baseUrl?: string | URL;
  readonly fetch?: import("./api").InspectorFetch;
  readonly headers?: HeadersInit;
  readonly storage?: CursorStorage;
  readonly storageKey?: string;
  readonly cache?: { readonly invalidate: (tags: readonly string[]) => void };
  readonly type?: StreamEventType;
  readonly reconnectDelayMs?: number;
  readonly maxReconnectDelayMs?: number;
  readonly maxReconnectAttempts?: number;
  readonly onEvent?: (event: StreamEvent) => void;
  readonly onStateChange?: (snapshot: StreamSnapshot) => void;
  readonly onInvalidate?: (tags: readonly string[], event?: StreamEvent) => void;
}

const invalidationTags: Record<StreamEventType, readonly string[]> = {
  "request.started": ["requests", "signals"],
  "request.completed": ["requests", "traces", "logs", "signals"],
  "log.emitted": ["logs", "signals"],
  "span.started": ["traces", "requests", "signals"],
  "span.updated": ["traces", "requests", "signals"],
  "span.completed": ["traces", "requests", "signals"],
  "job.changed": ["jobs", "runtime"],
  "event.published": ["events", "runtime"],
  "event.delivery.changed": ["events", "jobs", "runtime"],
  "generation.changed": ["graph", "runtime", "diagnostics", "env", "signals"],
  "diagnostic.changed": ["diagnostics"],
};
export function tagsForEvent(type: StreamEventType): readonly string[] {
  return invalidationTags[type];
}

export function browserStorage(): CursorStorage | undefined {
  try {
    return (globalThis as { localStorage?: CursorStorage }).localStorage;
  } catch {
    return undefined;
  }
}

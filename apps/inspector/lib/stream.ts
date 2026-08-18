import {
  INSPECTOR_API_BASE,
  INSPECTOR_API_PROTOCOL,
  INSPECTOR_API_VERSION,
  InspectorApiError,
  type InspectorFetch,
} from "./api-types";
import {
  tagsForEvent,
  browserStorage,
  type CursorStorage,
  type InspectorStreamOptions,
  type StreamEvent,
  type StreamSnapshot,
} from "./stream-protocol";
import { connectStream } from "./stream-reader";
export * from "./stream-protocol";

export class InspectorStreamClient {
  private readonly baseUrl: string;
  private readonly fetcher: InspectorFetch;
  private readonly headers: Headers;
  private readonly storage: CursorStorage | undefined;
  private readonly storageKey: string;
  private readonly options: InspectorStreamOptions;
  private readonly listeners = new Set<(event: StreamEvent) => void>();
  private controller: AbortController | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running = false;
  private current: StreamSnapshot = {
    state: "offline",
    cursor: undefined,
    droppedEvents: 0,
    reconnectAttempt: 0,
    error: undefined,
  };

  constructor(options: InspectorStreamOptions = {}) {
    this.options = options;
    this.baseUrl = options.baseUrl === undefined ? "" : String(options.baseUrl).replace(/\/$/, "");
    this.fetcher = options.fetch ?? ((input, init) => fetch(input, init));
    this.headers = new Headers(options.headers);
    this.headers.set("accept", "text/event-stream");
    this.headers.set("x-zsys-api-version", String(INSPECTOR_API_VERSION));
    this.headers.set("x-zsys-api-protocol", INSPECTOR_API_PROTOCOL);
    this.storage = options.storage ?? browserStorage();
    this.storageKey = options.storageKey ?? "zsys.inspector.stream.cursor";
    let cursor: string | null = null;
    try {
      cursor = this.storage?.getItem(this.storageKey) ?? null;
    } catch {}
    if (cursor !== null && cursor !== undefined && /^\d+$/.test(cursor))
      this.current = { ...this.current, cursor };
  }

  get snapshot(): StreamSnapshot {
    return this.current;
  }
  subscribe(listener: (event: StreamEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  start(): void {
    if (this.running) return;
    this.running = true;
    this.controller = new AbortController();
    void this.run();
  }
  stop(): void {
    this.running = false;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.controller?.abort();
    this.controller = undefined;
    this.setState({ state: "offline", reconnectAttempt: 0 });
  }

  private async run(): Promise<void> {
    let attempt = 0;
    let expiredCursorRetried = false;
    this.setState({ state: "connecting" });
    while (this.running) {
      try {
        const cursor = this.current.cursor;
        const headers = new Headers(this.headers);
        if (cursor !== undefined) headers.set("last-event-id", cursor);
        await connectStream({
          fetcher: this.fetcher,
          url: this.url(cursor),
          headers,
          signal: this.controller?.signal,
          active: () => this.running,
          connected: () => this.setState({ state: "connected", error: undefined }),
          event: (event, dropped) => this.receive(event, dropped),
        });
        if (!this.running) return;
        attempt = 0;
        expiredCursorRetried = false;
        throw new InspectorApiError(
          "Inspector stream disconnected",
          "ZSYS_INSPECTOR_DISCONNECTED",
          undefined,
          "network",
        );
      } catch (error) {
        if (!this.running || this.controller?.signal.aborted) return;
        const failure =
          error instanceof InspectorApiError
            ? error
            : new InspectorApiError(
                "Inspector stream failed",
                "ZSYS_INSPECTOR_DISCONNECTED",
                undefined,
                "network",
              );
        if (failure.isProtocolMismatch) {
          return this.setState({ state: "offline", error: failure });
        }
        if (failure.isCursorExpired && !expiredCursorRetried) {
          expiredCursorRetried = true;
          this.setState({ state: "reconnecting", reconnectAttempt: 0, error: failure });
          this.clearCursor();
          this.invalidate();
          attempt = 0;
          continue;
        }
        attempt += 1;
        if (attempt > (this.options.maxReconnectAttempts ?? Number.MAX_SAFE_INTEGER)) {
          return this.setState({ state: "offline", reconnectAttempt: attempt, error: failure });
        }
        this.setState({ state: "reconnecting", reconnectAttempt: attempt, error: failure });
        await this.wait(
          Math.min(
            this.options.maxReconnectDelayMs ?? 5_000,
            (this.options.reconnectDelayMs ?? 250) * 2 ** (attempt - 1),
          ),
        );
      }
    }
  }

  private receive(event: StreamEvent, extra: number): void {
    const previous = this.current.cursor === undefined ? 0 : Number(this.current.cursor);
    const next = Number(event.cursor);
    if (next <= previous) return;
    const gap = Math.max(0, next - previous - 1);
    this.persistCursor(event.cursor);
    this.setState({
      cursor: event.cursor,
      droppedEvents: this.current.droppedEvents + gap + extra,
      state: "connected",
      reconnectAttempt: 0,
      error: undefined,
    });
    for (const listener of this.listeners) listener(event);
    this.options.onEvent?.(event);
    this.invalidate(event);
  }

  private invalidate(event?: StreamEvent): void {
    const tags = event === undefined ? [] : tagsForEvent(event.type);
    this.options.cache?.invalidate(tags);
    this.options.onInvalidate?.(tags, event);
  }
  private persistCursor(cursor: string): void {
    try {
      if (this.storage) this.storage.setItem(this.storageKey, cursor);
    } catch {}
  }
  private clearCursor(): void {
    this.current = { ...this.current, cursor: undefined };
    try {
      this.storage?.removeItem(this.storageKey);
    } catch {}
  }
  private setState(next: Partial<StreamSnapshot>): void {
    if (next.state === "offline") this.running = false;
    this.current = { ...this.current, ...next };
    this.options.onStateChange?.(this.current);
  }
  private url(cursor?: string): string {
    const path = `${INSPECTOR_API_BASE}/stream${this.options.type === undefined ? "" : `?type=${encodeURIComponent(this.options.type)}`}`;
    const separator = path.includes("?") ? "&" : "?";
    const query = cursor === undefined ? "" : `${separator}cursor=${encodeURIComponent(cursor)}`;
    return this.baseUrl === ""
      ? `${path}${query}`
      : new URL(`${path}${query}`, `${this.baseUrl}/`).toString();
  }
  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.timer = setTimeout(resolve, Math.max(0, ms));
    });
  }
}

export const createInspectorStream = (
  options: InspectorStreamOptions = {},
): InspectorStreamClient => new InspectorStreamClient(options);

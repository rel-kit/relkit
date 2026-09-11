import type { ChannelCheckpoint, PresenceSnapshot } from "@relkit/realtime";
import type { ClientIdentityDocument } from "@relkit/contracts";
import { procedureCall } from "./procedure.js";

export type RealtimeStatus = "idle" | "connecting" | "connected" | "stale" | "error";

export type RealtimeFrame =
  | {
      readonly kind: "event";
      readonly event: string;
      readonly payload: unknown;
      readonly checkpoint: ChannelCheckpoint;
    }
  | { readonly kind: "caught-up"; readonly checkpoint: ChannelCheckpoint }
  | { readonly kind: "gap"; readonly reason: string; readonly checkpoint: ChannelCheckpoint }
  | { readonly kind: "presence"; readonly presence: PresenceSnapshot };

interface SharedSubscription {
  readonly controller: AbortController;
  readonly listeners: Set<(frame: RealtimeFrame) => void>;
  readonly statusListeners: Set<(status: RealtimeStatus) => void>;
  status: RealtimeStatus;
  checkpoint?: ChannelCheckpoint;
}

export class RealtimeManager {
  readonly subscriptions = new Map<string, SharedSubscription>();
  readonly statusListeners = new Set<() => void>();
  status: RealtimeStatus = "idle";

  constructor(
    private readonly client: unknown,
    private readonly identity?: Pick<ClientIdentityDocument, "identityScope" | "sessionEpoch">,
  ) {}

  subscribe(
    channel: string,
    params: unknown,
    listener: (frame: RealtimeFrame) => void,
    statusListener?: (status: RealtimeStatus) => void,
  ): () => void {
    const key = realtimeSubscriptionKey(channel, params);
    let shared = this.subscriptions.get(key);
    if (shared === undefined) {
      shared = {
        controller: new AbortController(),
        listeners: new Set(),
        statusListeners: new Set(),
        status: "connecting",
      };
      this.subscriptions.set(key, shared);
      void this.consume(key, channel, params, shared);
    }
    shared.listeners.add(listener);
    if (statusListener !== undefined) {
      shared.statusListeners.add(statusListener);
      statusListener(shared.status);
    }
    return () => {
      shared?.listeners.delete(listener);
      if (statusListener !== undefined) shared?.statusListeners.delete(statusListener);
      if (shared?.listeners.size === 0) {
        shared.controller.abort();
        this.subscriptions.delete(key);
        if (this.subscriptions.size === 0) this.setStatus("idle");
      }
    };
  }

  listenStatus(listener: () => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  dispose(): void {
    for (const subscription of this.subscriptions.values()) subscription.controller.abort();
    this.subscriptions.clear();
    this.setStatus("idle");
  }

  private async consume(
    key: string,
    channel: string,
    params: unknown,
    shared: SharedSubscription,
  ): Promise<void> {
    const signal = shared.controller.signal;
    while (!signal.aborted && this.subscriptions.get(key) === shared) {
      this.setSubscriptionStatus(shared, "connecting");
      try {
        const call = procedureCall(this.client, "relkit.realtime.subscribe");
        const stream = (await call(
          {
            channel,
            params,
            after: shared.checkpoint,
            ...(this.identity === undefined ? {} : { expectedIdentity: this.identity }),
          },
          { signal },
        )) as AsyncIterable<RealtimeFrame>;
        this.setSubscriptionStatus(shared, "connected");
        for await (const frame of stream) {
          if ("checkpoint" in frame) shared.checkpoint = frame.checkpoint;
          for (const listener of shared.listeners) listener(frame);
        }
        if (!signal.aborted) this.setSubscriptionStatus(shared, "stale");
      } catch {
        if (!signal.aborted) this.setSubscriptionStatus(shared, "error");
      }
      if (!signal.aborted) await delay(250);
    }
  }

  private setStatus(status: RealtimeStatus): void {
    if (this.status === status) return;
    this.status = status;
    for (const listener of this.statusListeners) listener();
  }

  private setSubscriptionStatus(shared: SharedSubscription, status: RealtimeStatus): void {
    this.setStatus(status);
    if (shared.status === status) return;
    shared.status = status;
    for (const listener of shared.statusListeners) listener(status);
  }
}

export function realtimeSubscriptionKey(channel: string, params: unknown): string {
  return JSON.stringify([channel, canonical(params)]);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonical(item)]),
  );
}

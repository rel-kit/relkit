import type { ChannelCheckpoint, PresenceSnapshot } from "relkit/realtime";

/** Existing realtime external-store states. */
export type RealtimeStatus = "idle" | "connecting" | "connected" | "stale" | "error";

/** Public channel frames retained without changing wire schemas. */
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

/** One connection shared inside its manager's authorization identity. */
export interface SharedSubscription {
  readonly controller: AbortController;
  readonly listeners: Set<(frame: RealtimeFrame) => void>;
  readonly statusListeners: Set<(status: RealtimeStatus) => void>;
  status: RealtimeStatus;
  checkpoint?: ChannelCheckpoint;
}

/** Realtime state and owned connection workers of one manager. */
export interface RealtimeSessionService {
  readonly feeds: Map<string, SharedSubscription>;
  readonly statusListeners: Set<() => void>;
  /** Reads the current external-store status.
   * @returns The status, synchronously and without native acquisition. */
  readonly snapshot: () => RealtimeStatus;
  /** Registers a manager-local view over a complete-key shared native connection.
   * @param channel - Declared channel key.
   * @param params - Complete native channel parameters.
   * @param listener - Isolated synchronous frame publication.
   * @param statusListener - Optional isolated lifecycle publication.
   * @returns An idempotent synchronous release of this view.
   * @throws Error when the sessions are stopped. */
  readonly subscribe: (
    channel: string,
    params: unknown,
    listener: (frame: RealtimeFrame) => void,
    statusListener?: (status: RealtimeStatus) => void,
  ) => () => void;
  /** Aborts every shared connection and resets idle state, synchronously.
   * @returns Nothing; {@link RealtimeSessionService.close} waits for the workers. */
  readonly stop: () => void;
  /** Stops the sessions and waits for every connection worker, pull and retry to settle.
   * @returns The same settlement Promise on repeated calls. */
  readonly close: () => Promise<void>;
}

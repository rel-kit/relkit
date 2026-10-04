import type { ChannelCheckpoint, PresenceSnapshot } from "@relkit/realtime";
import type { Effect, Fiber } from "effect";

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
  fiber?: Fiber.Fiber<void, unknown>;
}

/** Realtime state and scoped workflows supplied by live and test Layers. */
export interface RealtimeSessionService {
  readonly feeds: Map<string, SharedSubscription>;
  readonly statusListeners: Set<() => void>;
  /** Reads the current pure external-store status.
   * @returns A synchronous state read without native acquisition. */
  readonly snapshot: () => Effect.Effect<RealtimeStatus>;
  /** Registers a manager-local view over a complete-key scoped native connection.
   * @param channel - Declared channel key.
   * @param params - Complete native channel parameters.
   * @param listener - Isolated synchronous frame publication.
   * @param statusListener - Optional isolated lifecycle publication.
   * @returns A synchronous registration Effect yielding independently releasable view ownership. */
  readonly subscribe: (
    channel: string,
    params: unknown,
    listener: (frame: RealtimeFrame) => void,
    statusListener?: (status: RealtimeStatus) => void,
  ) => Effect.Effect<Effect.Effect<void>>;
  /** Initiates cancellation of all scoped native connections and resets idle state.
   * @returns A synchronous cancellation request; owner closure joins native workers. */
  readonly stop: () => Effect.Effect<void>;
}

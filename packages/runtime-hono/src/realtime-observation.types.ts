import type { PresenceSnapshot } from "@relkit/realtime";
import type { ChannelCheckpoint } from "@relkit/realtime";

/** Public channel frames retain the existing replay, event and presence protocol. */
export type RealtimeFrame =
  | { readonly kind: "gap"; readonly reason: string; readonly checkpoint: ChannelCheckpoint }
  | {
      readonly kind: "event";
      readonly event: string;
      readonly payload: unknown;
      readonly checkpoint: ChannelCheckpoint;
    }
  | { readonly kind: "presence"; readonly presence: PresenceSnapshot }
  | { readonly kind: "caught-up"; readonly checkpoint: ChannelCheckpoint };

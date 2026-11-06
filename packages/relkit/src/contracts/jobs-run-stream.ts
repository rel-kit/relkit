import type { JsonValue } from "./json.js";
import type { RunSnapshot } from "./jobs-run.js";

/** Connection state reported while observing a job run. */
export type RunConnection =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "completed"
  | "unauthorized"
  | "error"
  | "disposed";

/** Snapshot, update, or continuity reset sent to a run watcher. */
export type RunWatchFrame<Run = RunSnapshot> =
  | {
      readonly kind: "snapshot";
      readonly run: Run;
      readonly observedAt: string;
      readonly epoch: string;
      readonly sequence: number;
      readonly cursor?: string;
      readonly continuity: "state" | "history";
    }
  | {
      readonly kind: "update";
      readonly run: Run;
      readonly observedAt: string;
      readonly epoch: string;
      readonly sequence: number;
      readonly cursor?: string;
    }
  | {
      readonly kind: "reset";
      readonly run: Run;
      readonly observedAt: string;
      readonly epoch: string;
      readonly sequence: number;
      readonly reason: "reconnected" | "cursor-expired" | "history-unavailable" | "overflow";
      readonly cursor?: string;
    };

/** Identity of a named stream within one run attempt and generation. */
export interface StreamIdentity {
  readonly runId: string;
  readonly name: string;
  readonly attempt: number;
  readonly generation: string;
  readonly schemaVersion: string;
}

/** Lifecycle or item frame produced by a named job stream. */
export type NamedStreamFrame<Item = JsonValue> =
  | (StreamIdentity & { readonly kind: "start" })
  | (StreamIdentity & {
      readonly kind: "chunk";
      readonly sequence: number;
      readonly item: Item;
      readonly cursor?: string;
    })
  | (StreamIdentity & {
      readonly kind: "reset";
      readonly reason: "reconnected" | "cursor-expired" | "overflow";
    })
  | (StreamIdentity & { readonly kind: "end" });

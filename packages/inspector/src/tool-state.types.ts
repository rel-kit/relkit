/** Tool-owned projection; browser responses must select safe fields instead of serializing it. */
import type { Ref, Scope } from "effect";
import type { InspectorSelection } from "./discovery.types.js";
import type { InspectorHistoryOperations } from "./history.types.js";

/** One native writer and its child Scope survive app generation/session changes. */
export interface InspectorHistoryOwner {
  readonly projectId: string;
  readonly scope: Scope.Closeable;
  readonly operations: InspectorHistoryOperations;
  /**
   * Why the worker stopped on its own, such as `history.worker-exited`, or undefined while it
   * runs. Read on every status request, so a lost worker is reported before the next command.
   */
  readonly failure?: () => string | undefined;
}

/** Collection state contains only one finite batch at a time; no pending write queue. */
export interface InspectorToolState {
  readonly selection: InspectorSelection;
  /** When the application session entered its current state (ms); undefined before discovery. */
  readonly selectionSince?: number | undefined;
  /**
   * The last application session this run of the tool connected to, kept after it stops
   * answering. `stoppedAt` (ms) is undefined while that session is still connected.
   */
  readonly lastSession?: { readonly sessionId: string; readonly stoppedAt?: number } | undefined;
  readonly history: InspectorHistoryOwner | undefined;
  readonly sessionId: string | undefined;
  readonly through: number;
  readonly error: string | undefined;
  readonly incomplete: boolean;
  readonly droppedRecords: number;
  readonly lossKey?: string | undefined;
  readonly producerFailed?: number | undefined;
  readonly producerDropped?: number | undefined;
  /**
   * The last batch pulled from an application session and not stored yet, because history
   * failed. The application keeps it until acknowledged, so a later pull stores it; when the
   * session ends first, it is lost.
   */
  readonly unstored?: InspectorUnstoredBatch | undefined;
  /**
   * Records this run of the tool pulled from the application that history does not hold: refused
   * by the store, or still unstored when their session ended. Counted over the whole run.
   */
  readonly historyLost?: number | undefined;
}

/** A pulled batch that history has not stored. */
export interface InspectorUnstoredBatch {
  readonly sessionId: string;
  /** Last sequence stored before it. */
  readonly after: number;
  /** Its last sequence. */
  readonly through: number;
  readonly records: number;
}

/** Shared projection is owned by the acquired tool, never module global. */
export type InspectorToolStateRef = Ref.Ref<InspectorToolState>;

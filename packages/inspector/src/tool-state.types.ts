/** Tool-owned projection; browser responses must select safe fields instead of serializing it. */
import type { Ref, Scope } from "effect";
import type { InspectorSelection } from "./discovery.types.js";
import type { InspectorHistoryOperations } from "./history.types.js";

/** One native writer and its child Scope survive app generation/session changes. */
export interface InspectorHistoryOwner {
  readonly projectId: string;
  readonly scope: Scope.Closeable;
  readonly operations: InspectorHistoryOperations;
}

/** Collection state contains only one finite batch at a time; no pending write queue. */
export interface InspectorToolState {
  readonly selection: InspectorSelection;
  readonly history: InspectorHistoryOwner | undefined;
  readonly sessionId: string | undefined;
  readonly through: number;
  readonly error: string | undefined;
  readonly incomplete: boolean;
  readonly droppedRecords: number;
  readonly lossKey?: string | undefined;
  readonly producerFailed?: number | undefined;
  readonly producerDropped?: number | undefined;
}

/** Shared projection is owned by the acquired tool, never module global. */
export type InspectorToolStateRef = Ref.Ref<InspectorToolState>;

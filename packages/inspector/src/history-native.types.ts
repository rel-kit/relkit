/** Native history acquisition is replaceable and retains caller lifetime authority. */
import type { Effect, Scope } from "effect";
import type { InspectionConnectionError } from "relkit/inspector-api/connection";
import type { LocalWorkerEffects } from "relkit/observability/local/worker-contract";

/** Owns project binding, worker open and joined physical shutdown as one acquisition. */
export interface InspectorHistoryNativeOperations {
  /**
   * @param root - History directory.
   * @param projectId - Project the directory must belong to.
   * @param onFailure - Told once when the worker stops or fails without being closed.
   */
  readonly acquire: (
    root: string,
    projectId: string,
    onFailure?: (error: Error) => void,
  ) => Effect.Effect<LocalWorkerEffects, InspectionConnectionError, Scope.Scope>;
}

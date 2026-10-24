/** Native history acquisition is replaceable and retains caller lifetime authority. */
import type { Effect, Scope } from "effect";
import type { InspectionConnectionError } from "@relkit/inspector-api/connection";
import type { LocalWorkerEffects } from "@relkit/observability/local/worker-contract";

/** Owns project binding, worker open and joined physical shutdown as one acquisition. */
export interface InspectorHistoryNativeOperations {
  readonly acquire: (
    root: string,
    projectId: string,
  ) => Effect.Effect<LocalWorkerEffects, InspectionConnectionError, Scope.Scope>;
}

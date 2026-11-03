/** Report inspection capability available only to deterministic runtime tests. */
import type { Effect } from "effect";
import type { RuntimeEnvironmentOperations } from "../../../src/engine/server-runtime/server-runtime.types.js";
import type { ServerRuntimeFailure } from "../../../src/engine/server-runtime/server-runtime.schemas.js";

/** The production environment contract plus its test-owned evidence reader. */
export interface RuntimeEnvironmentTestOperations extends RuntimeEnvironmentOperations {
  readonly reports: () => Effect.Effect<ReadonlyArray<ServerRuntimeFailure>>;
}

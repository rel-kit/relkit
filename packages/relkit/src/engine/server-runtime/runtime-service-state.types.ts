/** Readiness gates and child scopes acquired once for a generation's runtime service. */
import type { Deferred, Scope } from "effect";
import type { RuntimeArea, RuntimeGenerationOwner } from "./server-runtime.types.js";

/** Extends shutdown authority with the parent receipt scope and one-shot health gates. */
export interface RuntimeServiceState extends RuntimeGenerationOwner {
  readonly owner: Scope.Scope;
  readonly readiness: Record<RuntimeArea, Deferred.Deferred<void>>;
}

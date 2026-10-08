import type { Effect } from "effect";
import type { AddRequest, ScaffoldPlan } from "./add-types.js";
import type { GeneratorDomainError, GeneratorIoError } from "./generator-errors.js";

/** Discovery and rendering owner; its acquired capabilities remain explicit Layer dependencies. */
export interface ScaffoldPlanningService {
  /**
   * Discovers declarations and constructs a complete conflict-checked add plan.
   * @param request - Normalized scaffold request.
   * @returns An Effect returning ordered operations and concrete dependencies without writing files.
   */
  readonly plan: (
    request: AddRequest,
  ) => Effect.Effect<ScaffoldPlan, GeneratorDomainError | GeneratorIoError>;
}

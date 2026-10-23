/** Composes project discovery, artifact planning and request-local builder state into an immutable scaffold plan before transaction acquisition. This companion contains the shared planning contracts without executing work. */

import type { Effect } from "effect";
import type { AddRequest, ScaffoldPlan } from "create-relkit/internal/add-types";
import type {
  GeneratorDomainError,
  GeneratorIoError,
} from "create-relkit/internal/generator-errors";

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

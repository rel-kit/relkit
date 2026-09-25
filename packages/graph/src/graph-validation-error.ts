import { Data, Effect } from "effect";
import { observeGraph, runGraph } from "./graph-observability.js";
import type { GraphOperation } from "./graph-observability.types.js";

/**
 * Tagged graph validation failure with a stable operation and descriptive message.
 * @example Effect.catchTag("GraphValidationError", (error) => Effect.logWarning(error.message));
 */
export class GraphValidationError extends Data.TaggedError("GraphValidationError")<{
  readonly operation: GraphOperation;
  readonly message: string;
}> {}

/** Internal sentinel preserving the synchronous TypeError contract.
 * @remarks Only this sentinel is converted to GraphValidationError by validationEffect.
 * @example throw new GraphValidationFault("Graph appId is invalid.");
 */
export class GraphValidationFault extends TypeError {}

/**
 * Evaluates a synchronous validation body as an observed, typed Effect.
 * @param operation - Stable validation operation name.
 * @param evaluate - Validation body that may raise GraphValidationFault.
 * @returns An Effect containing the result or GraphValidationError.
 * @example validationEffect("validation.id", () => "orders.get");
 */
export function validationEffect<A>(
  operation: GraphOperation,
  evaluate: () => A,
): Effect.Effect<A, GraphValidationError> {
  return observeGraph(operation, attemptValidation(operation, evaluate));
}

/**
 * Converts only the internal expected validation fault to a tagged failure.
 * @param operation - Stable validation operation name.
 * @param evaluate - Validation body to evaluate.
 * @returns An Effect containing the result or GraphValidationError.
 * @example attemptValidation("validation.graph", () => undefined);
 */
export function attemptValidation<A>(
  operation: GraphOperation,
  evaluate: () => A,
): Effect.Effect<A, GraphValidationError> {
  return Effect.try({ try: evaluate, catch: (error) => error }).pipe(
    Effect.catch((error) =>
      error instanceof GraphValidationFault
        ? Effect.fail(new GraphValidationError({ operation, message: error.message }))
        : Effect.die(error),
    ),
  );
}

/**
 * Runs a validation Effect and restores TypeError for synchronous callers.
 * @param effect - Typed graph validation Effect.
 * @returns The Effect success value.
 * @throws TypeError when graph validation fails; defects remain unchanged.
 * @example runValidation(validationEffect("validation.id", () => undefined));
 */
export function runValidation<A>(effect: Effect.Effect<A, GraphValidationError>): A {
  try {
    return runGraph(effect);
  } catch (error) {
    if (error instanceof GraphValidationError) throw new GraphValidationFault(error.message);
    throw error;
  }
}

/**
 * Raises an expected graph validation fault inside a validation Effect.
 * @param message - Stable human-readable validation failure.
 * @returns Never; the operation is terminated.
 * @throws GraphValidationFault, which the Effect boundary maps to GraphValidationError.
 * @example failValidation("Graph appId is invalid.");
 */
export function failValidation(message: string): never {
  throw new GraphValidationFault(message);
}

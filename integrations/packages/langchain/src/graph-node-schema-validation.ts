/** Validates native node input, output and optional resume schemas in authoring order before handler or identity construction; schema failures retain their existing graph-node boundary. */

import { Effect } from "effect";
import { assertAgentSchemaEffect } from "@relkit/agents/internal/agent-validation-schema";
import type { GraphNodeAny } from "./define-graph-node.types.js";
import { graphNodeValidationFailure } from "./graph-node-validation-error.js";

/** Validates each authored schema without invoking the user's node handler.
 * @param options - Input, output and optional resume schema from the original node options.
 * @returns A lazy Effect succeeding after validation or failing with the original graph-node diagnostic.
 */
export const validateGraphNodeSchemasEffect = Effect.fn("Agents.graphNode.validateSchemas")(
  function* (options: Pick<GraphNodeAny, "input" | "output" | "resume">) {
    const asGraphFailure = (failure: { readonly message: string }) =>
      graphNodeValidationFailure(new TypeError(failure.message));
    yield* assertAgentSchemaEffect(options.input, "input").pipe(Effect.mapError(asGraphFailure));
    yield* assertAgentSchemaEffect(options.output, "output").pipe(Effect.mapError(asGraphFailure));
    if (options.resume !== undefined)
      yield* assertAgentSchemaEffect(options.resume, "resume").pipe(
        Effect.mapError(asGraphFailure),
      );
  },
);

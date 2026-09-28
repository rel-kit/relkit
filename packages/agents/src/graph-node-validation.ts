import { Command, END, START, isCommand } from "@langchain/langgraph";
import { normalizeId } from "@relkit/contracts";
import type { InferOutput, StandardSchemaV1 } from "@relkit/schema";
import { Effect } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import type { GraphNodeAny, GraphNodeResult } from "./define-graph-node.js";
import { graphNodeValidationFailure } from "./graph-node-validation-error.js";
import {
  commandUpdateEffect,
  validatedUpdateEffect,
  validatedValueEffect,
  validateDestinationsEffect,
} from "./graph-node-validation-value.js";

/** Checks that every declared node destination exists in the graph.
 * @param node - Node identity and declared destinations.
 * @param registeredNodeIds - Graph node identities.
 * @returns An Effect with void or GraphNodeValidationFailure.
 * @example Effect.runSync(assertGraphNodeDestinationsEffect(node, ids));
 */
export const assertGraphNodeDestinationsEffect = Effect.fn("Agents.graphNode.destinations")(
  (
    node: Pick<GraphNodeAny, "id" | "ends">,
    registeredNodeIds: ReadonlySet<string> | readonly string[],
  ) =>
    Effect.try({
      try: () => {
        const registered =
          registeredNodeIds instanceof Set ? registeredNodeIds : new Set(registeredNodeIds);
        for (const destination of node.ends) {
          if (destination !== END && !registered.has(destination)) {
            throw new TypeError(
              `Graph node "${node.id}" declares unknown destination "${destination}"`,
            );
          }
        }
      },
      catch: graphNodeValidationFailure,
    }),
  (effect) => observeAgent("graph-node.destinations", effect),
);

/** Checks destinations for existing synchronous graph callers.
 * @param node - Node identity and declared destinations.
 * @param registeredNodeIds - Graph node identities.
 * @returns Nothing when every destination is known.
 * @throws The original unknown destination error.
 * @example assertGraphNodeDestinations(node, ids);
 */
export function assertGraphNodeDestinations(
  node: Pick<GraphNodeAny, "id" | "ends">,
  registeredNodeIds: ReadonlySet<string> | readonly string[],
): void {
  Effect.runSync(
    assertGraphNodeDestinationsEffect(node, registeredNodeIds).pipe(
      Effect.catchTag("GraphNodeValidationFailure", (failure) => Effect.fail(failure.cause)),
    ),
  );
}

/** Validates and freezes a node's static destination list.
 * @param value - Destination IDs or undefined.
 * @returns An Effect with normalized IDs or GraphNodeValidationFailure.
 * @example Effect.runSync(copyGraphNodeEndsEffect([END]));
 */
export const copyGraphNodeEndsEffect = Effect.fn("Agents.graphNode.copyEnds")(
  (value: readonly string[] | undefined) =>
    Effect.try({
      try: (): readonly string[] => {
        if (value === undefined) return Object.freeze([]);
        if (!Array.isArray(value)) throw new TypeError("Graph node ends must be an array");
        const ends = value.map((entry) => {
          if (entry === START) throw new TypeError("Graph node ends cannot contain START");
          return entry === END ? END : normalizeId(entry);
        });
        if (new Set(ends).size !== ends.length)
          throw new TypeError("Graph node ends must be unique");
        return Object.freeze(ends);
      },
      catch: graphNodeValidationFailure,
    }),
  (effect) => observeAgent("graph-node.copy-ends", effect),
);

/** Copies destinations for existing synchronous graph callers.
 * @param value - Destination IDs or undefined.
 * @returns A frozen normalized destination list.
 * @throws The original invalid or duplicate destination error.
 * @example const ends = copyGraphNodeEnds([END]);
 */
export function copyGraphNodeEnds(value: readonly string[] | undefined): readonly string[] {
  return Effect.runSync(
    copyGraphNodeEndsEffect(value).pipe(
      Effect.catchTag("GraphNodeValidationFailure", (failure) => Effect.fail(failure.cause)),
    ),
  );
}

/** Validates a node result and any native command update.
 * @param output - Node output schema.
 * @param ends - Declared destinations for native commands.
 * @param result - Node handler result.
 * @returns An Effect with a validated result or GraphNodeValidationFailure.
 * @example Effect.runPromise(validateGraphNodeResultEffect(schema, [], value));
 */
export const validateGraphNodeResultEffect = Effect.fn("Agents.graphNode.result")(
  function* <OutputSchema extends StandardSchemaV1, Ends extends readonly string[]>(
    output: OutputSchema,
    ends: Ends,
    result: unknown,
  ) {
    if (!isCommand(result)) return yield* validatedUpdateEffect(output, result);
    if (result.goto !== undefined && result.graph !== Command.PARENT) {
      yield* validateDestinationsEffect(ends, result.goto);
    }
    if (result.update !== undefined) {
      const update = yield* commandUpdateEffect(result.update);
      result.update = yield* validatedUpdateEffect(output, update);
    }
    return result as GraphNodeResult<OutputSchema, Ends>;
  },
  (effect) => observeAgent("graph-node.result", effect),
);

/** Validates a node result for existing Promise graph callers.
 * @param output - Node output schema.
 * @param ends - Declared destinations for native commands.
 * @param result - Node handler result.
 * @returns A validated node result.
 * @throws The original schema, update, or destination error.
 * @example await validateGraphNodeResult(schema, [], value);
 */
export function validateGraphNodeResult<
  OutputSchema extends StandardSchemaV1,
  Ends extends readonly string[],
>(output: OutputSchema, ends: Ends, result: unknown): Promise<GraphNodeResult<OutputSchema, Ends>> {
  return Effect.runPromise(
    validateGraphNodeResultEffect(output, ends, result).pipe(
      Effect.catchTag("GraphNodeValidationFailure", (failure) => Effect.fail(failure.cause)),
    ),
  );
}

/** Validates graph node input against its standard schema.
 * @param schema - Node input schema.
 * @param value - Candidate input.
 * @returns An Effect with validated input or GraphNodeValidationFailure.
 * @example Effect.runPromise(validatedGraphNodeInputEffect(schema, value));
 */
export const validatedGraphNodeInputEffect = Effect.fn("Agents.graphNode.input")(
  <Schema extends StandardSchemaV1>(schema: Schema, value: unknown) =>
    validatedValueEffect(schema, value, "input"),
  (effect) => observeAgent("graph-node.input", effect),
);

/** Validates graph node input for existing Promise graph callers.
 * @param schema - Node input schema.
 * @param value - Candidate input.
 * @returns Validated input.
 * @throws The original schema validation error.
 * @example await validatedGraphNodeInput(schema, value);
 */
export function validatedGraphNodeInput<Schema extends StandardSchemaV1>(
  schema: Schema,
  value: unknown,
): Promise<InferOutput<Schema>> {
  return Effect.runPromise(
    validatedGraphNodeInputEffect(schema, value).pipe(
      Effect.catchTag("GraphNodeValidationFailure", (failure) => Effect.fail(failure.cause)),
    ),
  );
}

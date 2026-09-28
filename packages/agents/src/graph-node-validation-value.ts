import { validate, type InferOutput, type StandardSchemaV1 } from "@relkit/schema";
import { Effect } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import { isRecord } from "./agent-validation.js";
import { graphNodeValidationFailure } from "./graph-node-validation-error.js";

/** Checks that native command destinations were declared by the node.
 * @param ends - Declared destinations.
 * @param value - Native command destination or list.
 * @returns An Effect with void or GraphNodeValidationFailure.
 * @example Effect.runSync(validateDestinationsEffect(["next"], "next"));
 */
export const validateDestinationsEffect = Effect.fn("Agents.graphNode.validateDestinations")((
  ends: readonly string[], value: unknown,
) => Effect.try({ try: () => validateDestinationsCore(ends, value), catch: graphNodeValidationFailure }),
  (effect) => observeAgent("graph-node.validate-destinations", effect));

/** Checks native command destinations for existing synchronous callers.
 * @param ends - Declared destinations.
 * @param value - Native command destination or list.
 * @returns Nothing for valid destinations.
 * @throws TypeError for invalid or undeclared destinations.
 * @example validateDestinations(["next"], "next");
 */
export function validateDestinations(ends: readonly string[], value: unknown): void {
  Effect.runSync(validateDestinationsEffect(ends, value).pipe(
    Effect.catchTag("GraphNodeValidationFailure", (failure) => Effect.fail(failure.cause)),
  ));
}

function validateDestinationsCore(ends: readonly string[], value: unknown): void {
  const entries = Array.isArray(value) ? value : [value];
  for (const entry of entries) {
    const destination = typeof entry === "string"
      ? entry
      : isRecord(entry) && typeof entry.node === "string" ? entry.node : undefined;
    if (destination === undefined) throw new TypeError("Graph node command contains an invalid destination");
    if (!ends.includes(destination)) {
      throw new TypeError(`Graph node command destination "${destination}" is not declared in ends`);
    }
  }
}

/** Converts a native command update entry list into an object.
 * @param value - Native update object or entry list.
 * @returns An Effect with an update or GraphNodeValidationFailure.
 * @example Effect.runSync(commandUpdateEffect([["count", 1]]));
 */
export const commandUpdateEffect = Effect.fn("Agents.graphNode.commandUpdate")(
  (value: unknown) => Effect.try({ try: () => commandUpdateCore(value), catch: graphNodeValidationFailure }),
  (effect) => observeAgent("graph-node.command-update", effect),
);

/** Converts a native command update for existing synchronous callers.
 * @param value - Native update object or entry list.
 * @returns An update object or the original value.
 * @throws TypeError for malformed entry lists.
 * @example commandUpdate([["count", 1]]);
 */
export function commandUpdate(value: unknown): unknown {
  return Effect.runSync(commandUpdateEffect(value).pipe(
    Effect.catchTag("GraphNodeValidationFailure", (failure) => Effect.fail(failure.cause)),
  ));
}

function commandUpdateCore(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  if (!value.every((entry) => Array.isArray(entry) && entry.length === 2 && typeof entry[0] === "string")) {
    throw new TypeError("Graph node command contains an invalid update");
  }
  return Object.fromEntries(value.map((entry) => [entry[0], entry[1]]));
}

/** Validates a graph node output as a record.
 * @param schema - Output schema.
 * @param value - Candidate output.
 * @returns An Effect with a record or GraphNodeValidationFailure.
 * @example await Effect.runPromise(validatedUpdateEffect(schema, output));
 */
export const validatedUpdateEffect = Effect.fn("Agents.graphNode.validatedUpdate")(
  function* <Schema extends StandardSchemaV1>(schema: Schema, value: unknown) {
    const projected = yield* validatedValueEffect(schema, value, "output");
    if (!(yield* Effect.sync(() => isRecord(projected)))) {
      return yield* Effect.fail(graphNodeValidationFailure(new TypeError("Graph node output must be an object")));
    }
    return projected as Extract<InferOutput<Schema>, Record<string, unknown>>;
  },
  (effect) => observeAgent("graph-node.validated-update", effect),
);

/** Validates a node output for existing Promise callers.
 * @param schema - Output schema.
 * @param value - Candidate output.
 * @returns Validated output record.
 * @throws The original schema or record error.
 * @example await validatedUpdate(schema, output);
 */
export function validatedUpdate<Schema extends StandardSchemaV1>(
  schema: Schema, value: unknown,
): Promise<Extract<InferOutput<Schema>, Record<string, unknown>>> {
  return Effect.runPromise(validatedUpdateEffect(schema, value).pipe(
    Effect.catchTag("GraphNodeValidationFailure", (failure) => Effect.fail(failure.cause)),
  ));
}

/** Validates a graph node input or output through its Standard Schema.
 * @param schema - Node schema.
 * @param value - Candidate value.
 * @param phase - Input or output diagnostic phase.
 * @returns An Effect with projected value or GraphNodeValidationFailure.
 * @example await Effect.runPromise(validatedValueEffect(schema, input, "input"));
 */
export const validatedValueEffect = Effect.fn("Agents.graphNode.validatedValue")(<Schema extends StandardSchemaV1>(
  schema: Schema, value: unknown, phase: "input" | "output",
) => Effect.tryPromise({
  try: async () => {
    const result = await validate(schema, value as never);
    if (!("value" in result)) {
      const detail = result.issues[0]?.message;
      throw new TypeError(`Graph node ${phase} validation failed${detail === undefined ? "" : `: ${detail}`}`);
    }
    return result.value;
  },
  catch: graphNodeValidationFailure,
}), (effect) => observeAgent("graph-node.validated-value", effect));

/** Validates a node value for existing Promise callers.
 * @param schema - Node schema.
 * @param value - Candidate value.
 * @param phase - Input or output diagnostic phase.
 * @returns Projected value.
 * @throws The original schema validation error.
 * @example await validatedValue(schema, input, "input");
 */
export function validatedValue<Schema extends StandardSchemaV1>(
  schema: Schema, value: unknown, phase: "input" | "output",
): Promise<InferOutput<Schema>> {
  return Effect.runPromise(validatedValueEffect(schema, value, phase).pipe(
    Effect.catchTag("GraphNodeValidationFailure", (failure) => Effect.fail(failure.cause)),
  ));
}

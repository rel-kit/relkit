import { FunctionInputError } from "./function-input-error.js";
import {
  getJsonSchema,
  type InferInput,
  type InferOutput,
  type StandardSchemaV1,
} from "@relkit/schema";
import { Effect } from "effect";
import { functionTry, runFunctionSync } from "./function-observability.js";
import type { StreamOutputSchema } from "./stream.types.js";

export type { StreamOutputSchema } from "./stream.types.js";

/** Creates a stream output schema in the Effect error channel.
 * @param item - Standard Schema validator for each item.
 * @returns The stream schema or a tagged validation failure.
 * @example Effect.runSync(streamOfEffect(z.string()));
 */
export const streamOfEffect = Effect.fn("functions.stream.create")(
  <const ItemSchema extends StandardSchemaV1>(
    item: ItemSchema,
  ): Effect.Effect<
    StreamOutputSchema<ItemSchema>,
    import("./function-observability.js").FunctionOperationError
  > =>
    functionTry("stream.create", () => {
      assertSchema(item);
      return Object.freeze({
        kind: "stream" as const,
        item,
        relkit: {
          jsonSchema: () =>
            runFunctionSync(
              functionTry("stream.create", () => {
                const projected = getJsonSchema(item);
                if (!projected.ok) throw new FunctionInputError(projected.reason);
                return { kind: "stream" as const, item: projected.schema };
              }),
            ),
        },
        "~standard": Object.freeze({
          version: 1 as const,
          vendor: "relkit",
          types: undefined as unknown as {
            readonly input: AsyncIterable<InferInput<ItemSchema>>;
            readonly output: AsyncIterable<InferOutput<ItemSchema>>;
          },
          validate: (value: unknown) =>
            runFunctionSync(
              functionTry("stream.validate", () =>
                isAsyncIterable(value)
                  ? { value: value as AsyncIterable<InferOutput<ItemSchema>> }
                  : { issues: [{ message: "Expected an AsyncIterable stream" }] },
              ),
            ),
        }),
      });
    }),
);

/** Declares a validated asynchronous stream result.
 * @param item - Standard Schema validator for each item.
 * @returns A frozen stream output schema.
 * @throws TypeError when the item is not a Standard Schema validator.
 * @example const output = streamOf(z.string());
 */
export function streamOf<const ItemSchema extends StandardSchemaV1>(
  item: ItemSchema,
): StreamOutputSchema<ItemSchema> {
  return runFunctionSync(streamOfEffect(item));
}

/** Checks whether a value is a stream output schema through Effect.
 * @param value - Candidate value.
 * @returns Effect yielding the type guard result.
 * @example Effect.runSync(isStreamOutputSchemaEffect(value));
 */
export const isStreamOutputSchemaEffect = Effect.fn("functions.stream.is-output")(
  (value: unknown) =>
    functionTry(
      "stream.is-output",
      () => isRecord(value) && value.kind === "stream" && isSchema(value.item),
    ),
);

/** Recognizes a stream output schema.
 * @param value - Candidate value.
 * @returns Whether the value is a stream schema.
 * @example if (isStreamOutputSchema(value)) console.log(value.item);
 */
export function isStreamOutputSchema(value: unknown): value is StreamOutputSchema {
  return runFunctionSync(isStreamOutputSchemaEffect(value));
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return isRecord(value) && typeof value[Symbol.asyncIterator] === "function";
}

function assertSchema(value: unknown): asserts value is StandardSchemaV1 {
  if (!isSchema(value))
    throw new FunctionInputError("streamOf item must be a Standard Schema v1 validator");
}

function isSchema(value: unknown): value is StandardSchemaV1 {
  return (
    isRecord(value) &&
    isRecord(value["~standard"]) &&
    value["~standard"].version === 1 &&
    typeof value["~standard"].validate === "function"
  );
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

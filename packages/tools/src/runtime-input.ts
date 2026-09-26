import { validate } from "@relkit/schema";
import { Effect } from "effect";
import { ToolArgumentValidationError, ToolArgumentsFailure } from "./runtime-errors.js";
import type { StandardSchemaV1 } from "@relkit/schema";

/** Parses a model-returned argument value through Effect.
 * @param value - Parsed value or JSON text.
 * @returns Parsed value or tagged argument failure.
 * @example Effect.runSync(parseToolArgumentsEffect("{\"id\":1}"));
 */
export const parseToolArgumentsEffect = Effect.fn("tools.parse-arguments")((value: unknown) =>
  Effect.gen(function* () {
    if (typeof value !== "string") return value;
    return yield* Effect.try({
      try: () => JSON.parse(value) as unknown,
      catch: () =>
        new ToolArgumentsFailure({
          cause: new ToolArgumentValidationError([
            { message: "Tool arguments must be valid JSON" },
          ]),
        }),
    });
  }),
);

/** Validates tool input through the inherited standard schema.
 * @param schema - Target input schema.
 * @param value - Parsed candidate value.
 * @returns Void or tagged argument failure.
 * @example await Effect.runPromise(validateToolArgumentsEffect(schema, { id: 1 }));
 */
export const validateToolArgumentsEffect = Effect.fn("tools.validate-arguments")(
  (schema: StandardSchemaV1, value: unknown) =>
    Effect.tryPromise({
      try: () => Promise.resolve(validate(schema, value as never)),
      catch: () =>
        new ToolArgumentsFailure({
          cause: new ToolArgumentValidationError([{ message: "Tool arguments failed validation" }]),
        }),
    }).pipe(
      Effect.flatMap((result) =>
        result.issues === undefined
          ? Effect.void
          : Effect.fail(
              new ToolArgumentsFailure({
                cause: new ToolArgumentValidationError(result.issues),
              }),
            ),
      ),
    ),
);

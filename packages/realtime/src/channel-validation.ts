import { normalizeId } from "@relkit/contracts";
import { validate, type StandardSchemaV1 } from "@relkit/schema";
import { Effect, Result } from "effect";
import { ChannelValidationError } from "./realtime-errors.js";
import { observeRealtime } from "./realtime-observability.js";
/** Runs a validation effect while retaining the public TypeError contract.
 * @param effect - Validated operation.
 * @returns Its successful value.
 * @throws TypeError for a tagged validation failure.
 * @example runChannelValidation(copyChannelEventsEffect({ posted: schema }));
 */
export function runChannelValidation<A>(effect: Effect.Effect<A, ChannelValidationError>): A {
  const result = Effect.runSync(Effect.result(effect));
  if (Result.isFailure(result)) throw new TypeError(result.failure.reason);
  return result.success;
}
/** Checks an unknown value for the record shape in the Effect path.
 * @param value - Candidate record.
 * @returns An Effect of a boolean without a typed failure.
 * @example Effect.runSync(isRecordEffect({}));
 */
export const isRecordEffect = Effect.fn("Realtime.isRecord")(
  function* (value: unknown) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  },
  (effect) => observeRealtime("channel.isRecord", effect),
);
/** Checks whether a value is a non-array record.
 * @param value - Candidate record.
 * @returns Whether the value is a record.
 * @example isRecord({});
 */
export function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return Effect.runSync(isRecordEffect(value));
}
/** Checks the Standard Schema v1 shape in the Effect path.
 * @param value - Candidate schema.
 * @returns An Effect of a boolean without a typed failure.
 * @example Effect.runSync(isChannelSchemaEffect(schema));
 */
export const isChannelSchemaEffect = Effect.fn("Realtime.isChannelSchema")(
  function* (value: unknown) {
    if (!(yield* isRecordEffect(value))) return false;
    const standard = (value as Record<PropertyKey, unknown>)["~standard"];
    if (!(yield* isRecordEffect(standard))) return false;
    const shape = standard as Record<PropertyKey, unknown>;
    return shape.version === 1 && typeof shape.validate === "function";
  },
  (effect) => observeRealtime("channel.isSchema", effect),
);
/** Checks a Standard Schema v1 validator.
 * @param value - Candidate schema.
 * @returns Whether the value is a validator.
 * @example isChannelSchema(schema);
 */
export function isChannelSchema(value: unknown): value is StandardSchemaV1 {
  return Effect.runSync(isChannelSchemaEffect(value));
}
/** Validates a schema shape with a tagged error.
 * @param value - Candidate schema.
 * @param name - Diagnostic field name.
 * @returns An Effect of void or ChannelValidationError.
 * @example Effect.runSync(assertChannelSchemaEffect(schema, "params"));
 */
export const assertChannelSchemaEffect = Effect.fn("Realtime.assertChannelSchema")(
  function* (value: unknown, name: string) {
    if (!(yield* isChannelSchemaEffect(value)))
      return yield* Effect.fail(
        new ChannelValidationError({
          operation: "channel.assertSchema",
          reason: `Channel ${name} must be a Standard Schema v1 validator`,
        }),
      );
  },
  (effect) => observeRealtime("channel.assertSchema", effect),
);
/** Asserts a Standard Schema v1 validator.
 * @param value - Candidate schema.
 * @param name - Diagnostic field name.
 * @returns Nothing on success.
 * @throws TypeError for a malformed schema.
 * @example assertChannelSchema(schema, "params");
 */
export function assertChannelSchema(
  value: unknown,
  name: string,
): asserts value is StandardSchemaV1 {
  runChannelValidation(assertChannelSchemaEffect(value, name));
}
/** Validates a value with a Standard Schema validator.
 * @param schema - Standard Schema validator.
 * @param value - Candidate value.
 * @param name - Diagnostic field name.
 * @returns An Effect of the decoded value or ChannelValidationError.
 * @example Effect.runPromise(validateChannelValueEffect(schema, value, "params"));
 */
export const validateChannelValueEffect = Effect.fn("Realtime.validateChannelValue")(
  function* (schema: StandardSchemaV1, value: unknown, name: string) {
    const failure = () =>
      new ChannelValidationError({
        operation: "channel.validateValue",
        reason: `Channel ${name} validation failed`,
      });
    const result = yield* Effect.tryPromise({
      try: async () => validate(schema, value),
      catch: (cause) =>
        new ChannelValidationError({
          operation: "channel.validateValue",
          reason: `Channel ${name} validation failed`,
          cause,
        }),
    });
    if (!("value" in result)) return yield* Effect.fail(failure());
    return result.value;
  },
  (effect) => observeRealtime("channel.validateValue", effect),
);
/** Validates a value through the Promise compatibility API.
 * @param schema - Standard Schema validator.
 * @param value - Candidate value.
 * @param name - Diagnostic field name.
 * @returns Decoded value.
 * @throws TypeError when validation fails.
 * @example await validateChannelValue(schema, value, "params");
 */
export async function validateChannelValue(
  schema: StandardSchemaV1,
  value: unknown,
  name: string,
): Promise<unknown> {
  const result = await Effect.runPromise(
    Effect.result(validateChannelValueEffect(schema, value, name)),
  );
  if (Result.isFailure(result)) {
    if ("cause" in result.failure) throw result.failure.cause;
    throw new TypeError(result.failure.reason);
  }
  return result.success;
}
/** Copies and normalizes an authored event schema map.
 * @param value - Candidate event map.
 * @returns An Effect of a frozen map or ChannelValidationError.
 * @example Effect.runSync(copyChannelEventsEffect({ changed: schema }));
 */
export const copyChannelEventsEffect = Effect.fn("Realtime.copyChannelEvents")(
  function* (value: unknown) {
    if (!(yield* isRecordEffect(value)))
      return yield* Effect.fail(
        new ChannelValidationError({
          operation: "channel.copyEvents",
          reason: "Channel events must be an object",
        }),
      );
    const result: Record<string, StandardSchemaV1> = {};
    for (const [name, schema] of Object.entries(value as Record<string, unknown>)) {
      const event = yield* Effect.try({
        try: () => normalizeId(name),
        catch: (error) =>
          new ChannelValidationError({
            operation: "channel.copyEvents",
            reason: error instanceof Error ? error.message : "Invalid channel event name",
          }),
      });
      yield* assertChannelSchemaEffect(schema, `event ${event}`);
      result[event] = schema as StandardSchemaV1;
    }
    return Object.freeze(result);
  },
  (effect) => observeRealtime("channel.copyEvents", effect),
);
/** Copies an event schema map.
 * @param value - Candidate event map.
 * @returns A frozen, normalized map.
 * @throws TypeError for invalid names or schemas.
 * @example copyChannelEvents({ changed: schema });
 */
export function copyChannelEvents(value: unknown): Readonly<Record<string, StandardSchemaV1>> {
  return runChannelValidation(copyChannelEventsEffect(value));
}

import { validate, type StandardSchemaV1 } from "@relkit/schema";
import type { EventAttributeValue, EventPublishOptions } from "@relkit/functions";
import { Effect } from "effect";
import {
  EventClientValidationError,
  EventPayloadValidationError,
  EventPayloadValidationFailure,
} from "./client-errors.js";
import { isRecord } from "./client-record.js";
import { observeEvent, runEventSync } from "./event-observability.js";

/** Validates a publication payload with its Standard Schema contract.
 * @param schema - Optional payload schema.
 * @param payload - Candidate payload.
 * @returns An Effect succeeding with decoded payload or failing with a tagged validation error.
 * @example await Effect.runPromise(parsePayloadEffect(schema, payload))
 */
export const parsePayloadEffect = Effect.fn("Events.parsePayload")(
  (schema: StandardSchemaV1 | undefined, payload: unknown) =>
    observeEvent(
      "client.parsePayload",
      Effect.gen(function* () {
        if (schema === undefined) return payload;
        const result = yield* Effect.tryPromise({
          try: () => Promise.resolve(validate(schema, payload as never)),
          catch: (cause: unknown) =>
            new EventClientValidationError({
              message: cause instanceof Error ? cause.message : "Event payload validation failed",
              cause,
            }),
        });
        if (result.issues !== undefined)
          return yield* new EventPayloadValidationFailure(result.issues);
        return result.value;
      }),
    ),
);

/** Promise adapter for payload validation.
 * @param schema - Optional payload schema.
 * @param payload - Candidate payload.
 * @returns Decoded payload.
 * @throws EventPayloadValidationError or EventClientValidationError.
 * @example await parsePayload(schema, payload)
 */
export function parsePayload(
  schema: StandardSchemaV1 | undefined,
  payload: unknown,
): Promise<unknown> {
  return Effect.runPromise(parsePayloadEffect(schema, payload)).catch((error: unknown) => {
    if (error instanceof EventPayloadValidationFailure)
      throw new EventPayloadValidationError(error.issues);
    if (error instanceof EventClientValidationError && Object.hasOwn(error, "cause"))
      throw error.cause;
    throw error;
  });
}

/** Validates and freezes publisher request options.
 * @param value - Candidate options.
 * @returns Frozen options or a tagged validation failure.
 * @example Effect.runSync(normalizeOptionsEffect({ key: "order-1" }))
 */
export const normalizeOptionsEffect = Effect.fn("Events.normalizeOptions")((value: unknown) =>
  observeEvent(
    "client.normalizeOptions",
    validation(() => options(value)),
  ),
);

/** Synchronous adapter for request option normalization.
 * @param value - Candidate options.
 * @returns Frozen options.
 * @throws TypeError for malformed options.
 * @example normalizeOptions({ key: "order-1" })
 */
export function normalizeOptions(value: unknown): EventPublishOptions {
  return runValidation(normalizeOptionsEffect(value));
}

function options(value: unknown): EventPublishOptions {
  if (!isRecord(value)) throw new TypeError("Event publish options must be an object");
  const key = value.key;
  optionalText(key, "key");
  const attributes = value.attributes;
  if (attributes !== undefined && !isRecord(attributes))
    throw new TypeError("Event attributes must be an object");
  return Object.freeze({
    ...(key === undefined ? {} : { key: key as string }),
    ...(attributes === undefined ? {} : { attributes: attributesValue(attributes) }),
  });
}

/** Normalizes and sorts bounded event attributes.
 * @param value - Candidate attribute record.
 * @returns A frozen record or tagged validation failure.
 * @example Effect.runSync(normalizeAttributesEffect({ source: "checkout" }))
 */
export const normalizeAttributesEffect = Effect.fn("Events.normalizeAttributes")((value: unknown) =>
  observeEvent(
    "client.normalizeAttributes",
    validation(() => attributesValue(value)),
  ),
);

function attributesValue(value: unknown): Readonly<Record<string, EventAttributeValue>> {
  if (!isRecord(value)) throw new TypeError("Event attributes must be an object");
  const result: Record<string, EventAttributeValue> = {};
  for (const key of Object.keys(value).sort()) {
    const item = value[key];
    if (
      typeof item !== "string" &&
      typeof item !== "boolean" &&
      (typeof item !== "number" || !Number.isFinite(item))
    )
      throw new TypeError(`Event attribute "${key}" must be a string, finite number, or boolean`);
    result[key] = item;
  }
  return Object.freeze(result);
}

/** Requires optional text to be non-empty when present.
 * @param value - Candidate text.
 * @param name - Field label in the error message.
 * @returns Void or a tagged validation failure.
 * @example Effect.runSync(assertOptionalTextEffect("key", "key"))
 */
export const assertOptionalTextEffect = Effect.fn("Events.assertOptionalText")(
  (value: unknown, name: string) =>
    observeEvent(
      "client.assertOptionalText",
      validation(() => optionalText(value, name)),
    ),
);

/** Synchronous optional text assertion.
 * @param value - Candidate text.
 * @param name - Field label in the error message.
 * @returns Void.
 * @throws TypeError for empty or non-text input.
 * @example assertOptionalText("key", "key")
 */
export function assertOptionalText(value: unknown, name: string): void {
  runValidation(assertOptionalTextEffect(value, name));
}

function optionalText(value: unknown, name: string): void {
  if (value !== undefined && (typeof value !== "string" || value.trim() === ""))
    throw new TypeError(`Event ${name} must be non-empty text`);
}

/** Requires a positive safe event version.
 * @param value - Candidate version.
 * @returns The version or a tagged validation failure.
 * @example Effect.runSync(assertVersionEffect(1))
 */
export const assertVersionEffect = Effect.fn("Events.assertVersion")((value: unknown) =>
  observeEvent(
    "client.assertVersion",
    validation(() => {
      if (!Number.isSafeInteger(value) || Number(value) < 1)
        throw new TypeError("Event version must be a positive integer");
      return value as number;
    }),
  ),
);

/** Synchronous positive version assertion.
 * @param value - Candidate version.
 * @returns Void.
 * @throws TypeError for an invalid version.
 * @example assertVersion(1)
 */
export function assertVersion(value: unknown): asserts value is number {
  runValidation(assertVersionEffect(value));
}

function validation<A>(work: () => A): Effect.Effect<A, EventClientValidationError> {
  return Effect.try({
    try: work,
    catch: (cause) =>
      new EventClientValidationError({
        message: cause instanceof Error ? cause.message : "Invalid event value",
      }),
  });
}

function runValidation<A>(effect: Effect.Effect<A, EventClientValidationError>): A {
  try {
    return runEventSync(effect);
  } catch (error) {
    if (error instanceof EventClientValidationError) throw new TypeError(error.message);
    throw error;
  }
}

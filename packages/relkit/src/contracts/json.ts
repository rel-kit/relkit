import { Effect } from "effect";
import { observeContract, runContract } from "./contract-observability.js";
import { JsonValueError } from "./json-validation.js";
import { serializeCanonical } from "./json-serialize.js";

export type { JsonPrimitive, JsonValue, MaybePromise } from "./json.types.js";
export {
  assertJsonValue,
  assertJsonValueEffect,
  isJsonPrimitive,
  isJsonPrimitiveEffect,
  isJsonValue,
  isJsonValueEffect,
  JsonValueError,
} from "./json-validation.js";

/**
 * Serializes JSON deterministically by sorting object keys at every depth.
 * @param value - Candidate JSON value.
 * @returns An Effect containing canonical JSON, or JsonValueError.
 * @example Effect.runSync(serializeJsonEffect({ b: 2, a: 1 }));
 */
export function serializeJsonEffect(value: unknown): Effect.Effect<string, JsonValueError> {
  return observeContract(
    "json.serialize",
    Effect.try({
      try: () => serializeCanonical(value),
      catch: (error) => error,
    }).pipe(
      Effect.catch((error) =>
        error instanceof JsonValueError ? Effect.fail(error) : Effect.die(error),
      ),
    ),
  );
}

/**
 * Synchronous compatibility adapter for canonical JSON serialization.
 * @param value - Candidate JSON value.
 * @returns JSON with object keys sorted at each depth.
 * @throws JsonValueError for unsupported values or cycles.
 * @example serializeJson({ b: 2, a: 1 });
 */
export function serializeJson(value: unknown): string {
  return runContract(serializeJsonEffect(value));
}

/** Alias for the one canonical JSON serializer. */
export const canonicalJson = serializeJson;

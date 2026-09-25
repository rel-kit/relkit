import { Effect } from "effect";
import { observeConfig, runConfigSync } from "./config-observability.js";
import { ConfigValidationError } from "./config-validation-error.js";
import type { JsonValue } from "./env-json.types.js";

export type { JsonValue } from "./env-json.types.js";

/** Convert declaration examples to immutable, JSON-safe values.
 * @param value - Candidate example value.
 * @returns Effect with frozen JSON data or ConfigValidationError.
 * @example Effect.runSync(toJsonValueEffect({ count: 2 }));
 */
export function toJsonValueEffect(value: unknown): Effect.Effect<JsonValue, ConfigValidationError> {
  return observeConfig("json-value", convertValue(value));
}

/** Convert an example synchronously for existing callers.
 * @param value - Candidate example value.
 * @returns Frozen JSON-safe value.
 * @throws TypeError for unsupported values or accessors.
 * @example toJsonValue({ count: 2 });
 */
export function toJsonValue(value: unknown): JsonValue {
  return runConfigSync(toJsonValueEffect(value));
}

function convertValue(value: unknown): Effect.Effect<JsonValue, ConfigValidationError> {
  return Effect.gen(function* () {
    if (value === null || typeof value === "string" || typeof value === "boolean") return value;
    if (typeof value === "number") {
      if (!Number.isFinite(value)) {
        return yield* Effect.fail(
          new ConfigValidationError({ message: "Examples must contain finite JSON values" }),
        );
      }
      return Object.is(value, -0) ? 0 : value;
    }
    if (value instanceof URL) return value.toString();
    if (Array.isArray(value)) {
      const items: JsonValue[] = [];
      for (const item of value) items.push(yield* convertValue(item));
      return Object.freeze(items);
    }
    if (typeof value !== "object" || value === undefined) {
      return yield* Effect.fail(
        new ConfigValidationError({ message: "Examples must contain JSON-safe values" }),
      );
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return yield* Effect.fail(
        new ConfigValidationError({ message: "Examples must contain plain objects" }),
      );
    }
    const result: Record<string, JsonValue> = {};
    for (const key of Object.keys(value)) {
      const property = Object.getOwnPropertyDescriptor(value, key);
      if (!property || !("value" in property)) {
        return yield* Effect.fail(
          new ConfigValidationError({ message: "Examples cannot contain accessors" }),
        );
      }
      result[key] = yield* convertValue(property.value);
    }
    return Object.freeze(result);
  });
}

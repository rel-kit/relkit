import { Effect, Exit } from "effect";
import { observeContract, runContract } from "./contract-observability.js";
import { serializeJsonEffect } from "./json.js";
import type { JsonPrimitive, JsonValue } from "./json.types.js";

/**
 * Tagged failure when a value cannot cross the JSON boundary.
 * `path` identifies the rejected value and `reason` describes why.
 * @example Effect.catchTag("JsonValueError", (error) => Effect.logWarning(error.path));
 */
// TODO(better-pkg): Use Data.TaggedError after TypeError-based callers migrate.
// Audit TypeError guards in packages/runtime-hono/src/agent-rpc-errors.ts,
// agent-protocol-support.ts, agent-inspector.ts, packages/cli/src/commands/dev-telemetry.ts,
// and packages/client/src/jobs/reconcile.ts before removing this compatibility.
export class JsonValueError extends TypeError {
  readonly _tag = "JsonValueError" as const;
  constructor(
    readonly path: string,
    readonly reason: string,
  ) {
    super(`Invalid JSON value at ${path}: ${reason}`);
    this.name = "JsonValueError";
  }
}

/**
 * Checks whether a value is a finite JSON primitive.
 * @param value - Candidate primitive.
 * @returns An Effect containing the validation result.
 * @example Effect.runSync(isJsonPrimitiveEffect(42));
 */
export function isJsonPrimitiveEffect(value: unknown): Effect.Effect<boolean> {
  return observeContract(
    "json.is-primitive",
    Effect.sync(
      () =>
        value === null ||
        typeof value === "string" ||
        typeof value === "boolean" ||
        (typeof value === "number" && Number.isFinite(value)),
    ),
  );
}

/**
 * Synchronous predicate for JSON primitives.
 * @param value - Candidate primitive.
 * @returns Whether the value is JSON-safe; narrows its TypeScript type.
 * @example if (isJsonPrimitive(value)) encode(value);
 */
export function isJsonPrimitive(value: unknown): value is JsonPrimitive {
  return runContract(isJsonPrimitiveEffect(value));
}

/**
 * Checks recursive JSON safety using the canonical serializer.
 * @param value - Candidate value.
 * @returns An Effect containing the validation result.
 * @example Effect.runSync(isJsonValueEffect({ id: "1" }));
 */
export function isJsonValueEffect(value: unknown): Effect.Effect<boolean> {
  return observeContract(
    "json.is-value",
    Effect.map(Effect.exit(serializeJsonEffect(value)), Exit.isSuccess),
  );
}

/**
 * Synchronous predicate for recursively JSON-safe values.
 * @param value - Candidate value.
 * @returns Whether serialization succeeds; narrows its TypeScript type.
 * @example if (isJsonValue(value)) store(value);
 */
export function isJsonValue(value: unknown): value is JsonValue {
  return runContract(isJsonValueEffect(value));
}

/**
 * Requires a recursively JSON-safe value.
 * @param value - Candidate value.
 * @returns An Effect completing when serialization succeeds.
 * @example Effect.runSync(assertJsonValueEffect({ id: "1" }));
 */
export function assertJsonValueEffect(value: unknown): Effect.Effect<void, JsonValueError> {
  return observeContract("json.assert-value", Effect.asVoid(serializeJsonEffect(value)));
}

/**
 * Synchronous assertion for recursively JSON-safe values.
 * @param value - Candidate value.
 * @returns Nothing; narrows the input type on success.
 * @throws JsonValueError for unsupported values or cycles.
 * @example assertJsonValue({ id: "1" });
 */
export function assertJsonValue(value: unknown): asserts value is JsonValue {
  runContract(assertJsonValueEffect(value));
}

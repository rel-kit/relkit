import { Effect, Result, Schema } from "effect";
import { observeJobs } from "./jobs-observability.js";

/** A task schema that cannot be represented as faithful canonical JSON.
 * @example new CanonicalProjectionError({ name: "input", reason: "invalid schema" });
 */
export class CanonicalProjectionError extends Schema.TaggedError<CanonicalProjectionError>()(
  "Jobs.CanonicalProjectionError",
  { name: Schema.String, reason: Schema.String },
) {}

/** Traverses a projected schema in Effect, preserving exact validation failures.
 * @param value - Untrusted projection.
 * @param name - Diagnostic field name.
 * @param allowVoid - Whether a root void schema is permitted.
 * @returns An Effect of void or CanonicalProjectionError.
 * @example Effect.runPromise(assertCanonicalProjectionEffect({ type: "string" }, "input"));
 */
export const assertCanonicalProjectionEffect = Effect.fn("Jobs.assertCanonicalProjection")(
  function* (value: unknown, name: string, allowVoid = false) {
    yield* visitEffect(value, name, allowVoid, true);
  },
  (effect) => observeJobs("canonical.assertProjection", effect),
);

/** Synchronous canonical-schema assertion.
 * @param value - Untrusted projection.
 * @param name - Diagnostic field name.
 * @param allowVoid - Whether a root void schema is permitted.
 * @returns Nothing when canonical.
 * @throws TypeError when the projection is not faithful canonical JSON.
 * @example assertCanonicalProjection({ type: "string" }, "input");
 */
export function assertCanonicalProjection(value: unknown, name: string, allowVoid = false): void {
  const result = Effect.runSync(
    Effect.result(assertCanonicalProjectionEffect(value, name, allowVoid)),
  );
  if (Result.isFailure(result)) throw new TypeError(result.failure.reason);
}

/** Recursively checks one schema node and its known child positions. */
const visitEffect = Effect.fn("Jobs.visitCanonicalProjection")(function* (
  value: unknown,
  name: string,
  allowVoid: boolean,
  root: boolean,
): Generator<Effect.Effect<unknown, CanonicalProjectionError>, void, unknown> {
  const fail = (reason: string) => Effect.fail(new CanonicalProjectionError({ name, reason }));
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return yield* fail(`${name} has no faithful canonical JSON schema`);
  const record = value as Record<string, unknown>;
  if (record["x-relkit-void"] === true) {
    if (!allowVoid || !root) return yield* fail(`${name} must not contain void values`);
    return;
  }
  if (record.format === "binary")
    return yield* fail(`${name} must not contain non-canonical binary values`);
  if (Object.keys(record).length === 0)
    return yield* fail(`${name} must expose a bounded canonical JSON schema`);
  const properties = record.properties;
  if (properties !== null && typeof properties === "object" && !Array.isArray(properties)) {
    for (const child of Object.values(properties)) yield* visitEffect(child, name, false, false);
  }
  for (const child of [record.additionalProperties, record.items]) {
    if (child !== null && typeof child === "object" && !Array.isArray(child))
      yield* visitEffect(child, name, false, false);
  }
  for (const group of [record.prefixItems, record.anyOf, record.oneOf, record.allOf]) {
    if (Array.isArray(group))
      for (const child of group) yield* visitEffect(child, name, false, false);
  }
});

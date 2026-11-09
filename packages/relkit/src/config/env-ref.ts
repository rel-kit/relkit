import { Effect } from "effect";
import { observeConfig, runConfigSync } from "./config-observability.js";
import type { EnvBuilderBase, EnvRef } from "./env.types.js";

/** Check whether a value is a typed environment reference.
 * @param value - Candidate value.
 * @returns Effect with a type guard result and no expected failures.
 * @example Effect.runSync(isEnvRefEffect(definition.MODE));
 */
export function isEnvRefEffect(value: unknown): Effect.Effect<boolean> {
  return observeConfig(
    "is-ref",
    Effect.sync(
      () =>
        isRecord(value) &&
        value.kind === "env-ref" &&
        typeof value.name === "string" &&
        typeof value.type === "string" &&
        typeof value.sensitive === "boolean" &&
        isRecord(value.metadata),
    ),
  );
}

/** Check a reference synchronously for existing callers.
 * @param value - Candidate value.
 * @returns True when the value has the reference shape.
 * @example isEnvRef(definition.MODE);
 */
export function isEnvRef(value: unknown): value is EnvRef {
  return runConfigSync(isEnvRefEffect(value));
}

/** Create an immutable typed field reference.
 * @param name - Declared field name.
 * @param field - Field builder with immutable metadata.
 * @returns Effect with a frozen reference and no expected failures.
 * @example Effect.runSync(createEnvRefEffect("MODE", env.string()));
 */
export function createEnvRefEffect<Name extends string, Value>(
  name: Name,
  field: EnvBuilderBase,
): Effect.Effect<EnvRef<Name, Value>> {
  return observeConfig(
    "create-ref",
    Effect.sync(
      () =>
        Object.freeze({
          kind: "env-ref" as const,
          name,
          type: field.metadata.type,
          sensitive: field.metadata.sensitive,
          metadata: field.metadata,
        }) as EnvRef<Name, Value>,
    ),
  );
}

/** Create a field reference synchronously for a declaration.
 * @param name - Declared field name.
 * @param field - Field builder.
 * @returns Frozen typed reference.
 * @example createEnvRef("MODE", env.string());
 */
export function createEnvRef<Name extends string, Value>(
  name: Name,
  field: EnvBuilderBase,
): EnvRef<Name, Value> {
  return runConfigSync(createEnvRefEffect<Name, Value>(name, field));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

import type { EnvBuilderBase, EnvRef } from "./env-types.js";

/** Returns whether a value is a typed, value-free environment reference. */
export function isEnvRef(value: unknown): value is EnvRef {
  return (
    isRecord(value) &&
    value.kind === "env-ref" &&
    typeof value.name === "string" &&
    typeof value.type === "string" &&
    typeof value.sensitive === "boolean" &&
    isRecord(value.metadata)
  );
}

export function createEnvRef<Name extends string, Value>(
  name: Name,
  field: EnvBuilderBase,
): EnvRef<Name, Value> {
  return Object.freeze({
    kind: "env-ref" as const,
    name,
    type: field.metadata.type,
    sensitive: field.metadata.sensitive,
    metadata: field.metadata,
  }) as EnvRef<Name, Value>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

import { validate, type StandardSchemaV1 } from "@relkit/schema";
import { MISSING, type Missing } from "./request-mapping-body.js";

/** Applies a declared Standard Schema transform and reports public mapping issues.
 * @param id - Stable declaration identifier used for lookup.
 * @param value - Value inspected, validated or projected by this operation.
 * @param transforms - Manifest transform declarations resolved by identifier.
 * @param path - Ordered validation path or confined resource path.
 * @param report - Issue callback retaining validation paths and public messages.
 * @returns The transformed value, or MISSING after any declaration or schema issue is reported.
 */
export async function applyTransform(
  id: unknown,
  value: unknown | Missing,
  transforms: Readonly<Record<string, unknown>> | ReadonlyMap<string, unknown> | undefined,
  path: readonly (string | number)[],
  report: (message: string, path: readonly (string | number)[]) => void,
): Promise<unknown | Missing> {
  if (value === MISSING) return MISSING;
  if (typeof id !== "string") {
    report("Request transform ID must be text", path);
    return MISSING;
  }
  const entry =
    transforms instanceof Map
      ? transforms.get(id)
      : transforms === undefined
        ? undefined
        : (transforms as Readonly<Record<string, unknown>>)[id];
  const schema = transformSchema(entry);
  if (schema === undefined) {
    report(`Request transform "${id}" is missing`, path);
    return MISSING;
  }
  try {
    const result = await validate(schema, value as never);
    if (!("value" in result)) {
      for (const item of result.issues) report(item.message, [...path, ...toPath(item.path)]);
      return MISSING;
    }
    return result.value;
  } catch {
    report(`Request transform "${id}" failed`, path);
    return MISSING;
  }
}

/** Resolves a transform schema from either supported manifest representation.
 * @param value - Value inspected, validated or projected by this operation.
 * @returns The embedded or direct Standard Schema, or undefined for an unsupported declaration.
 */
function transformSchema(value: unknown): StandardSchemaV1 | undefined {
  const candidate = isRecord(value) && isRecord(value.schema) ? value.schema : value;
  return isRecord(candidate) &&
    isRecord(candidate["~standard"]) &&
    candidate["~standard"].version === 1 &&
    typeof candidate["~standard"].validate === "function"
    ? (candidate as unknown as StandardSchemaV1)
    : undefined;
}
/** Converts schema issue paths into serializable string and number segments.
 * @param value - Value inspected, validated or projected by this operation.
 * @returns Serializable issue-path segments, or an empty array when no path is provided.
 */
function toPath(value: readonly unknown[] | undefined): readonly (string | number)[] {
  return (
    value?.map((item) => {
      if (typeof item === "number") return item;
      if (isRecord(item) && "key" in item)
        return typeof item.key === "number" ? item.key : String(item.key);
      return String(item);
    }) ?? []
  );
}
/** Recognizes a non-null object before reading its named properties.
 * @param value - Value inspected, validated or projected by this operation.
 * @returns Whether the inspected value satisfies the declared type guard.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

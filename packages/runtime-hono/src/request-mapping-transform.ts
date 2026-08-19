import { validate, type StandardSchemaV1 } from "@zsys/schema";
import { MISSING, type Missing } from "./request-mapping-body.js";

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

function transformSchema(value: unknown): StandardSchemaV1 | undefined {
  const candidate = isRecord(value) && isRecord(value.schema) ? value.schema : value;
  return isRecord(candidate) &&
    isRecord(candidate["~standard"]) &&
    candidate["~standard"].version === 1 &&
    typeof candidate["~standard"].validate === "function"
    ? (candidate as unknown as StandardSchemaV1)
    : undefined;
}
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
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

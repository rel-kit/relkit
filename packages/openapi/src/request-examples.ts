/** Supplies length-valid request examples without changing validation or authored values. */
import type { JsonValue } from "@relkit/contracts";
import type { OpenApiSchema } from "./generate.types.js";

/** Adds examples only where plain string bounds establish their validity.
 * @param schema - Projected request schema; never mutated.
 * @returns A schema retaining authored examples/defaults and all validation keywords.
 * @example requestExamples({ type: "string", minLength: 1 });
 */
export function requestExamples(schema: OpenApiSchema): OpenApiSchema {
  if (["$ref", "allOf", "anyOf", "oneOf", "not"].some((key) => schema[key] !== undefined))
    return schema;
  const result = { ...schema };
  if (isSchema(schema.properties))
    result.properties = Object.fromEntries(
      Object.entries(schema.properties).map(([key, value]) => [
        key,
        isSchema(value) ? requestExamples(value) : value,
      ]),
    );
  if (isSchema(schema.items)) result.items = requestExamples(schema.items);
  const example = stringExample(schema);
  return example === undefined ? result : { ...result, example };
}

/** Bounds allocation and declines constraints that require an authored semantic example. */
function stringExample(schema: OpenApiSchema): string | undefined {
  if (
    schema.type !== "string" ||
    [
      "example",
      "examples",
      "default",
      "const",
      "enum",
      "pattern",
      "format",
      "contentEncoding",
      "contentMediaType",
    ].some((key) => schema[key] !== undefined)
  )
    return;
  const min = schema.minLength;
  const max = schema.maxLength;
  if (typeof min !== "number" || !Number.isSafeInteger(min) || min < 1) return;
  if (max !== undefined && (typeof max !== "number" || !Number.isSafeInteger(max) || max < min))
    return;
  // shortcut: examples above 4 KiB need an authored example; avoid allocating schema-sized payloads.
  if (min > 4096) return;
  const length = Math.min(Math.max(min, 7), typeof max === "number" ? max : 4096);
  return "example".padEnd(length, "x").slice(0, length);
}

/** Narrows JSON schema objects without interpreting example data as schemas. */
function isSchema(value: JsonValue | undefined): value is OpenApiSchema {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

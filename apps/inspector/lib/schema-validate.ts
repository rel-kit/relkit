import {
  asInputSchema,
  schemaRecord,
  schemaStrings,
  unwrapSchema,
  type SchemaRecord,
} from "./schema-model";
import type { ValidationIssue } from "./request-failure";

/**
 * Checks a value against the common JSON Schema keywords of a declared schema: type, required
 * fields, allowed values, limits, array items and unknown fields. The application validates again
 * when it receives the payload; this is only to stop an obviously wrong one before it is sent.
 * @param schema - A schema node or JSON schema; anything unreadable accepts every value.
 * @param value - The parsed payload.
 * @returns One issue per failing field, in document order, with a dotted path.
 */
export function validateAgainstSchema(schema: unknown, value: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  check(schemaRecord(unwrapSchema(asInputSchema(schema))), value, [], issues, 0);
  return issues;
}

function check(
  schema: SchemaRecord | undefined,
  value: unknown,
  path: readonly string[],
  issues: ValidationIssue[],
  depth: number,
): void {
  if (schema === undefined || depth > 8) return;
  const here = path.join(".");
  const add: Add = (code, at = here) => {
    issues.push({ path: at, code });
  };
  const branches = Array.isArray(schema.anyOf) ? schema.anyOf : schema.oneOf;
  if (Array.isArray(branches) && branches.length > 0) {
    const matches = branches.some((branch) => {
      const found: ValidationIssue[] = [];
      check(schemaRecord(unwrapSchema(branch)), value, path, found, depth + 1);
      return found.length === 0;
    });
    if (!matches) add("invalid_union");
    return;
  }
  if (schema.const !== undefined && JSON.stringify(schema.const) !== JSON.stringify(value))
    return add("invalid_literal");
  if (Array.isArray(schema.enum) && !schema.enum.some((item) => same(item, value)))
    return add("invalid_enum_value");
  const types = typeList(schema.type);
  if (types.length > 0 && !types.some((type) => isType(type, value))) return add("invalid_type");
  if (typeof value === "string") checkString(schema, value, add);
  else if (typeof value === "number") checkNumber(schema, value, add);
  else if (Array.isArray(value)) checkArray(schema, value, path, issues, depth, add);
  else if (value !== null && typeof value === "object")
    checkObject(schema, value as Record<string, unknown>, path, issues, depth, add);
}

type Add = (code: string, at?: string) => void;

function checkString(schema: SchemaRecord, value: string, add: Add): void {
  if (typeof schema.minLength === "number" && value.length < schema.minLength) add("too_small");
  if (typeof schema.maxLength === "number" && value.length > schema.maxLength) add("too_big");
  if (typeof schema.pattern === "string") {
    try {
      if (!new RegExp(schema.pattern, "u").test(value)) add("invalid_string");
    } catch {
      // A pattern this browser cannot compile is left to the application.
    }
  }
}

function checkNumber(schema: SchemaRecord, value: number, add: Add): void {
  const below = (limit: unknown, exclusive: boolean) =>
    typeof limit === "number" && (exclusive ? value <= limit : value < limit);
  const above = (limit: unknown, exclusive: boolean) =>
    typeof limit === "number" && (exclusive ? value >= limit : value > limit);
  if (below(schema.minimum, false) || below(schema.exclusiveMinimum, true)) add("too_small");
  if (above(schema.maximum, false) || above(schema.exclusiveMaximum, true)) add("too_big");
}

function checkArray(
  schema: SchemaRecord,
  value: readonly unknown[],
  path: readonly string[],
  issues: ValidationIssue[],
  depth: number,
  add: Add,
): void {
  if (typeof schema.minItems === "number" && value.length < schema.minItems) add("too_small");
  if (typeof schema.maxItems === "number" && value.length > schema.maxItems) add("too_big");
  const items = schemaRecord(unwrapSchema(schema.items));
  value.forEach((item, index) => check(items, item, [...path, String(index)], issues, depth + 1));
}

function checkObject(
  schema: SchemaRecord,
  value: Record<string, unknown>,
  path: readonly string[],
  issues: ValidationIssue[],
  depth: number,
  add: Add,
): void {
  const properties = schemaRecord(schema.properties) ?? {};
  for (const key of schemaStrings(schema.required))
    if (value[key] === undefined) add("missing", [...path, key].join("."));
  for (const [key, item] of Object.entries(value)) {
    const property = properties[key];
    if (property === undefined) {
      if (schema.additionalProperties === false) add("unrecognized_keys", [...path, key].join("."));
      continue;
    }
    check(schemaRecord(unwrapSchema(property)), item, [...path, key], issues, depth + 1);
  }
}

function typeList(type: unknown): readonly string[] {
  if (typeof type === "string") return [type];
  return Array.isArray(type) ? schemaStrings(type) : [];
}

function isType(type: string, value: unknown): boolean {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "null":
      return value === null;
    case "array":
      return Array.isArray(value);
    case "object":
      return value !== null && typeof value === "object" && !Array.isArray(value);
    default:
      return true;
  }
}

function same(left: unknown, right: unknown): boolean {
  return left === right || JSON.stringify(left) === JSON.stringify(right);
}

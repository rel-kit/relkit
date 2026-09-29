import { Effect } from "effect";
/** Narrows an untrusted value to a JSON object in the current Effect workflow.
 * @param value - Unknown document value.
 * @returns An Effect yielding a record or `undefined`; it has no expected failure.
 * @example Effect.runSync(recordCalculation({ type: "string" }));
 */
export const recordCalculation = Effect.fnUntraced(function* (value: unknown) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
});
/** Unwraps RELKIT schema documents and accepts ordinary JSON Schema records.
 * @param value - Schema document or unknown input.
 * @returns An Effect yielding a schema record or `undefined`; it has no expected failure.
 * @example Effect.runSync(schemaDocumentCalculation({ type: "string" }));
 */
export const schemaDocumentCalculation = Effect.fnUntraced(function* (value: unknown) {
  const record = yield* recordCalculation(value);
  if (record === undefined) return undefined;
  if (record.$relkit === "schema") {
    const nested = yield* recordCalculation(record.jsonSchema);
    if (nested !== undefined) return nested;
  }
  return record;
});
/** Serializes a schema literal, retaining `unknown` for undefined.
 * @param value - Literal JSON Schema value.
 * @returns An Effect yielding a TypeScript literal; it has no expected failure.
 * @example Effect.runSync(literalTypeCalculation("ready"));
 */
export const literalTypeCalculation = Effect.fnUntraced(function* (value: unknown) {
  return value === undefined ? "unknown" : (JSON.stringify(value) ?? "unknown");
});
/** Recursively renders JSON Schema as a TypeScript type expression.
 * @param value - Schema document to render.
 * @returns An Effect yielding a type expression; it has no expected failure.
 * @example Effect.runSync(schemaTypeCalculation({ type: "array", items: { type: "string" } }));
 */
export const schemaTypeCalculation: (value: unknown) => Effect.Effect<string> = Effect.fnUntraced(
  function* (value: unknown) {
    const schema = yield* schemaDocumentCalculation(value);
    if (schema === undefined) return "unknown";
    if (Object.prototype.hasOwnProperty.call(schema, "const"))
      return yield* literalTypeCalculation(schema.const);
    if (Array.isArray(schema.enum)) {
      const values: string[] = [];
      for (const item of schema.enum) values.push(yield* literalTypeCalculation(item));
      return values.join(" | ") || "unknown";
    }
    const unions = schema.oneOf ?? schema.anyOf;
    if (Array.isArray(unions)) {
      const variants: string[] = [];
      for (const item of unions) variants.push(yield* schemaTypeCalculation(item));
      return variants.join(" | ") || "unknown";
    }
    if (schema.type === "array") return `readonly ${yield* schemaTypeCalculation(schema.items)}[]`;
    if (schema.type === "object" || schema.properties !== undefined) {
      const properties = (yield* recordCalculation(schema.properties)) ?? {};
      const required = new Set(Array.isArray(schema.required) ? schema.required : []);
      const entries: string[] = [];
      for (const key of Object.keys(properties).sort()) {
        const item = yield* schemaTypeCalculation(properties[key]);
        entries.push(`${JSON.stringify(key)}${required.has(key) ? "" : "?"}: ${item}`);
      }
      return entries.length === 0 ? "Record<string, unknown>" : `{ ${entries.join("; ")} }`;
    }
    if (schema.type === "string") return "string";
    if (schema.type === "integer" || schema.type === "number") return "number";
    if (schema.type === "boolean") return "boolean";
    if (schema.type === "null") return "null";
    return "unknown";
  },
);

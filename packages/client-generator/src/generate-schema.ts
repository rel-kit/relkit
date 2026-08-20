import type { ClientRoute, ResponseContract } from "./generate-types.js";

export function schemaType(value: unknown): string {
  const schema = schemaDocument(value);
  if (schema === undefined) return "unknown";
  if (Object.prototype.hasOwnProperty.call(schema, "const")) return literalType(schema.const);
  if (Array.isArray(schema.enum)) return schema.enum.map(literalType).join(" | ") || "unknown";
  const unions = schema.oneOf ?? schema.anyOf;
  if (Array.isArray(unions)) return unions.map(schemaType).join(" | ") || "unknown";
  if (schema.type === "array") return `readonly ${schemaType(schema.items)}[]`;
  if (schema.type === "object" || schema.properties !== undefined) {
    const properties = isRecord(schema.properties) ? schema.properties : {};
    const required = new Set(Array.isArray(schema.required) ? schema.required : []);
    const entries = Object.keys(properties)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}${required.has(key) ? "" : "?"}: ${schemaType(properties[key])}`,
      );
    return entries.length === 0 ? "Record<string, unknown>" : `{ ${entries.join("; ")} }`;
  }
  if (schema.type === "string") return "string";
  if (schema.type === "integer" || schema.type === "number") return "number";
  if (schema.type === "boolean") return "boolean";
  if (schema.type === "null") return "null";
  return "unknown";
}

export function schemaAt(root: unknown, path: readonly string[]): unknown {
  let current = schemaDocument(root);
  for (const key of path) {
    const properties = current?.properties;
    if (!isRecord(properties)) return undefined;
    current = schemaDocument(properties[key]);
  }
  return current;
}

export function responseSchema(route: ClientRoute, response: ResponseContract): unknown {
  if (response.kind === "success") return route.target.output;
  if (response.kind === "validation-error") return validationSchema;
  if (response.status === 429) return rateLimitSchema;
  if (response.kind !== "error") return undefined;
  const errors = Array.isArray(route.target.errors) ? route.target.errors : [];
  const declared = errors.find(
    (entry) => isRecord(entry) && entry.id === (response.errorId ?? response.id),
  );
  const data = isRecord(declared) ? declared.data : undefined;
  const http = isRecord(declared) && isRecord(declared.http) ? declared.http : undefined;
  const status = typeof http?.status === "number" ? http.status : undefined;
  const retry =
    declared?.retry === "never" || declared?.retry === "later" ? declared.retry : undefined;
  return {
    type: "object",
    required: [
      "kind",
      "outcome",
      "code",
      "message",
      "retry",
      ...(status === undefined ? [] : ["status"]),
      ...(response.schema === undefined && data === undefined ? [] : ["data"]),
    ],
    properties: {
      kind: { const: "application" },
      outcome: { const: "declared-error" },
      code: { const: response.errorId ?? response.id },
      message: { type: "string" },
      ...(response.schema === undefined && data === undefined
        ? {}
        : { data: response.schema ?? data }),
      status:
        status === undefined ? { type: "integer", minimum: 100, maximum: 599 } : { const: status },
      retry: retry === undefined ? { enum: ["never", "later"] } : { const: retry },
    },
  };
}

const validationSchema = {
  type: "object",
  required: ["error", "issues"],
  properties: {
    error: { const: "validation" },
    issues: { type: "array", items: { type: "object" } },
  },
};

const rateLimitSchema = {
  type: "object",
  required: ["error", "retryAfterMs"],
  properties: {
    error: { const: "rate-limit" },
    retryAfterMs: { type: "integer" },
  },
};

function schemaDocument(value: unknown): SchemaRecord | undefined {
  if (!isRecord(value)) return undefined;
  if (value.$zsys === "schema" && isRecord(value.jsonSchema)) return value.jsonSchema;
  return value;
}

function literalType(value: unknown): string {
  return value === undefined ? "unknown" : (JSON.stringify(value) ?? "unknown");
}

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

type SchemaRecord = Record<string, any>;

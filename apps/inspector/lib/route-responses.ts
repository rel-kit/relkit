const validationSchema = {
  type: "object",
  required: ["error", "issues"],
  properties: {
    error: { const: "validation", type: "string" },
    issues: {
      type: "array",
      items: {
        type: "object",
        required: ["code", "message", "path"],
        properties: {
          code: { type: "string" },
          message: { type: "string" },
          path: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
};

export function buildRouteResponses(
  value: unknown,
  target: Record<string, unknown> | undefined,
): Record<string, Record<string, unknown>> {
  const entries = (Array.isArray(value) ? value : [])
    .map(record)
    .filter((entry): entry is Record<string, unknown> => entry !== undefined)
    .sort((a, b) => Number(a.status) - Number(b.status) || text(a.id).localeCompare(text(b.id)));
  const result: Record<string, Record<string, unknown>> = {};
  let hasValidation = false;
  for (const entry of entries) {
    if (entry.kind === "validation-error") hasValidation = true;
    const status = String(entry.status);
    const schema = responseSchema(entry, target);
    const next = {
      description: responseDescription(entry),
      ...(schema === undefined || status === "204" || status === "304"
        ? {}
        : { content: { "application/json": { schema } } }),
    };
    result[status] = result[status] === undefined ? next : mergeResponses(result[status], next);
  }
  if (!hasValidation)
    result["422"] = {
      description: "Validation error",
      content: { "application/json": { schema: validationSchema } },
    };
  return result;
}

function responseSchema(
  entry: Record<string, unknown>,
  target: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (entry.kind === "success") return schemaValue(entry.schema) ?? schemaValue(target?.output);
  if (entry.kind === "validation-error") return schemaValue(entry.schema) ?? validationSchema;
  if (entry.kind === "error") return errorSchema(entry, target);
  return schemaValue(entry.schema);
}

function errorSchema(
  entry: Record<string, unknown>,
  target: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const errorId = text(entry.errorId) || text(entry.id) || "error";
  const errors = Array.isArray(target?.errors) ? target.errors : [];
  const definition = errors.map(record).find((value) => value?.id === errorId);
  const http = record(definition?.http);
  const retry =
    definition?.retry === "never" || definition?.retry === "later" ? definition.retry : undefined;
  const data = schemaValue(entry.schema) ?? schemaValue(definition?.data);
  const status = typeof http?.status === "number" ? http.status : undefined;
  return {
    type: "object",
    required: [
      "kind",
      "outcome",
      "code",
      "message",
      ...(data === undefined ? [] : ["data"]),
      ...(status === undefined ? [] : ["status"]),
      "retry",
    ],
    properties: {
      kind: { const: "application", type: "string" },
      outcome: { const: "declared-error", type: "string" },
      code: { const: errorId, type: "string" },
      message: { type: "string" },
      ...(data === undefined ? {} : { data }),
      ...(status === undefined
        ? { status: { type: "integer", minimum: 100, maximum: 599 } }
        : { status: { const: status, type: "integer" } }),
      retry: retry === undefined ? { enum: ["never", "later"] } : { const: retry, type: "string" },
    },
  };
}

function mergeResponses(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): Record<string, unknown> {
  const leftSchema = schemaValue(record(record(left.content)?.["application/json"])?.schema);
  const rightSchema = schemaValue(record(record(right.content)?.["application/json"])?.schema);
  if (leftSchema === undefined || rightSchema === undefined)
    return {
      description: `${text(left.description)}; ${text(right.description)}`,
      ...(left.content === undefined ? { content: right.content } : { content: left.content }),
    };
  return {
    description: `${text(left.description)}; ${text(right.description)}`,
    content: { "application/json": { schema: { oneOf: [leftSchema, rightSchema] } } },
  };
}

function responseDescription(entry: Record<string, unknown>): string {
  if (entry.kind === "success") return "Successful response";
  if (entry.kind === "validation-error") return "Validation error";
  if (entry.kind === "error") return `Declared error ${text(entry.errorId) || text(entry.id)}`;
  return `Response ${text(entry.id)}`;
}

function schemaValue(value: unknown): Record<string, unknown> | undefined {
  const recordValue = record(value);
  if (recordValue?.$relkit === "schema") return record(recordValue.jsonSchema);
  return recordValue;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

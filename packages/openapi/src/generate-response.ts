import { Effect } from "effect";
import { observeOpenApi } from "./generate-observability.js";
import type {
  FunctionNode,
  JsonValue,
  OpenApiResponse,
  OpenApiSchema,
} from "./generate-response.types.js";

const validationSchema: OpenApiSchema = {
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
          path: { type: "array", items: { anyOf: [{ type: "string" }, { type: "integer" }] } },
        },
      },
    },
  },
};

const rateLimitSchema: OpenApiSchema = {
  type: "object",
  required: ["error", "retryAfterMs"],
  properties: {
    error: { const: "rate-limit", type: "string" },
    retryAfterMs: { type: "integer", minimum: 0 },
  },
};

/** Project declared responses and the validation fallback for one function.
 * @param values - Serializable response declarations.
 * @param target - Target function and error definitions.
 * @returns Effect containing status-indexed responses; no expected failure.
 * @example Effect.runSync(buildResponsesEffect(responses, functionNode));
 */
export const buildResponsesEffect = Effect.fn("OpenApi.buildResponses")(
  (values: JsonValue, target: FunctionNode): Effect.Effect<Record<string, OpenApiResponse>> =>
    observeOpenApi(
      "responses",
      Effect.sync(() => {
        const result: Record<string, OpenApiResponse> = {};
        const entries = (Array.isArray(values) ? values : [])
          .filter(isRecord)
          .sort(
            (left, right) =>
              Number(left.status) - Number(right.status) ||
              String(left.id).localeCompare(String(right.id)),
          );
        const hasValidation = entries.some((entry) => entry.kind === "validation-error");
        for (const entry of entries) {
          const status = String(entry.status);
          const schema =
            entry.kind === "success"
              ? (schemaValue(entry.schema) ?? schemaValue(target.output))
              : entry.kind === "validation-error"
                ? (schemaValue(entry.schema) ?? validationSchema)
                : entry.kind === "error"
                  ? errorSchema(entry, target)
                  : schemaValue(entry.schema);
          const rateLimited = status === "429" && String(entry.id).startsWith("rate-limit");
          const next = makeResponse(
            rateLimited ? "Rate limit exceeded" : description(entry),
            status === "204" || status === "304"
              ? undefined
              : (schema ?? (rateLimited ? rateLimitSchema : undefined)),
            rateLimited,
          );
          const previous = result[status];
          result[status] = previous === undefined ? next : mergeResponses(previous, next);
        }
        if (!hasValidation) result["422"] = makeResponse("Validation error", validationSchema);
        return result;
      }),
    ),
);

/** Project a declared application error using function metadata when available. */
function errorSchema(entry: Record<string, unknown>, target: FunctionNode): OpenApiSchema {
  const errorId = typeof entry.errorId === "string" ? entry.errorId : String(entry.id ?? "error");
  const definition = Array.isArray(target.errors)
    ? target.errors.filter(isRecord).find((item) => item.id === errorId)
    : undefined;
  const definitionHttp = isRecord(definition?.http) ? definition.http : undefined;
  const status = typeof definitionHttp?.status === "number" ? definitionHttp.status : undefined;
  const retry =
    definition?.retry === "never" || definition?.retry === "later" ? definition.retry : undefined;
  const data =
    schemaValue(entry.schema) ??
    (definition === undefined ? undefined : schemaValue(definition.data));
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

/** Merge duplicate status responses, including bodies and rate-limit headers. */
function mergeResponses(left: OpenApiResponse, right: OpenApiResponse): OpenApiResponse {
  const a = left.content?.["application/json"]?.schema;
  const b = right.content?.["application/json"]?.schema;
  const headers = { ...left.headers, ...right.headers };
  const responseHeaders = Object.keys(headers).length === 0 ? {} : { headers };
  if (!a || !b) {
    const content = left.content ?? right.content;
    return {
      description: `${left.description}; ${right.description}`,
      ...(content === undefined ? {} : { content }),
      ...responseHeaders,
    };
  }
  return {
    description: `${left.description}; ${right.description}`,
    content: { "application/json": { schema: { oneOf: [a, b] } } },
    ...responseHeaders,
  };
}

/** Build a JSON response and optional standard rate-limit headers. */
function makeResponse(
  description: string,
  schema?: OpenApiSchema,
  rateLimited = false,
): OpenApiResponse {
  return {
    description,
    ...(schema === undefined ? {} : { content: { "application/json": { schema } } }),
    ...(rateLimited ? { headers: rateLimitHeaders } : {}),
  };
}

const rateLimitHeaders = {
  "RateLimit-Policy": {
    description: "Limit and window policy applied to the route",
    schema: { type: "string" },
  },
  "RateLimit-Limit": {
    description: "Request limit for the active window",
    schema: { type: "integer" },
  },
  "RateLimit-Remaining": {
    description: "Requests remaining in the active window",
    schema: { type: "integer" },
  },
  "RateLimit-Reset": {
    description: "Seconds until the active window resets",
    schema: { type: "integer" },
  },
  "Retry-After": {
    description: "Seconds before another request should be attempted",
    schema: { type: "integer" },
  },
} satisfies NonNullable<OpenApiResponse["headers"]>;

/** Choose a stable description for each response kind. */
function description(entry: Record<string, unknown>): string {
  if (entry.kind === "success") return "Successful response";
  if (entry.kind === "validation-error") return "Validation error";
  if (entry.kind === "error") return `Declared error ${String(entry.errorId ?? entry.id)}`;
  return `Response ${String(entry.id)}`;
}

/** Unwrap a graph-typed JSON schema after a shallow object check. */
function schemaValue(value: unknown): OpenApiSchema | undefined {
  if (!isRecord(value)) return undefined;
  return value.$relkit === "schema" && isRecord(value.jsonSchema)
    ? (value.jsonSchema as OpenApiSchema)
    : (value as OpenApiSchema);
}

/** Narrow an unknown response value to a non-array object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

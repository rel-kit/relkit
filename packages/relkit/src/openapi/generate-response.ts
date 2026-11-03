import { Effect } from "effect";
import { observeOpenApi } from "./generate-observability.js";
import type {
  FunctionNode,
  JsonValue,
  OpenApiResponse,
  OpenApiSchema,
} from "./generate-response.types.js";

const PROBLEM = "application/problem+json";

/** The Problem Details body every RelKit error response has, narrowed by `fields`.
 * @param required - Fields the narrowed problem always has, beyond the common ones.
 * @param fields - Property schemas that replace or add to the common ones.
 * @returns A JSON Schema for the problem body.
 */
function problemSchema(
  required: readonly string[] = [],
  fields: Readonly<Record<string, OpenApiSchema>> = {},
): OpenApiSchema {
  return {
    type: "object",
    required: ["type", "title", "status", "code", "detail", ...required],
    properties: {
      type: { type: "string" },
      title: { type: "string" },
      status: { type: "integer", minimum: 100, maximum: 599 },
      code: { type: "string" },
      detail: { type: "string" },
      traceId: { type: "string" },
      ...fields,
    },
  };
}

const validationSchema = problemSchema(["issues"], {
  type: { const: "/errors/validation", type: "string" },
  code: { const: "validation", type: "string" },
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
});

const rateLimitSchema = problemSchema(["data"], {
  type: { const: "/errors/rate-limited", type: "string" },
  status: { const: 429, type: "integer" },
  code: { const: "rate-limited", type: "string" },
  data: {
    type: "object",
    required: ["retryAfterMs"],
    properties: { retryAfterMs: { type: "integer", minimum: 0 } },
  },
});

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
          const problem = entry.kind !== "success" && Number(entry.status) >= 400;
          const next = makeResponse(
            rateLimited ? "Rate limit exceeded" : description(entry),
            status === "204" || status === "304"
              ? undefined
              : (schema ?? (rateLimited ? rateLimitSchema : problem ? problemSchema() : undefined)),
            rateLimited,
            problem ? PROBLEM : "application/json",
          );
          const previous = result[status];
          result[status] = previous === undefined ? next : mergeResponses(previous, next);
        }
        if (!hasValidation)
          result["422"] = makeResponse("Validation error", validationSchema, false, PROBLEM);
        return result;
      }),
    ),
);

/** Project a declared application error as its own problem schema. */
function errorSchema(entry: Record<string, unknown>, target: FunctionNode): OpenApiSchema {
  const errorId = typeof entry.errorId === "string" ? entry.errorId : String(entry.id ?? "error");
  const definition = Array.isArray(target.errors)
    ? target.errors.filter(isRecord).find((item) => item.id === errorId)
    : undefined;
  const status = typeof entry.status === "number" ? entry.status : undefined;
  const data =
    schemaValue(entry.schema) ??
    (definition === undefined ? undefined : schemaValue(definition.data));
  return problemSchema(data === undefined ? [] : ["data"], {
    type: { const: `/errors/${errorId}`, type: "string" },
    ...(status === undefined ? {} : { status: { const: status, type: "integer" } }),
    code: { const: errorId, type: "string" },
    ...(data === undefined ? {} : { data }),
  });
}

/** Merge duplicate status responses, including bodies and rate-limit headers. */
function mergeResponses(left: OpenApiResponse, right: OpenApiResponse): OpenApiResponse {
  const [type, a] = mediaSchema(left);
  const [, b] = mediaSchema(right);
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
    content: { [type]: { schema: { oneOf: [a, b] } } },
    ...responseHeaders,
  };
}

/** The media type and schema of a response's single body. */
function mediaSchema(response: OpenApiResponse): [string, OpenApiSchema | undefined] {
  const [type, media] = Object.entries(response.content ?? {})[0] ?? ["application/json"];
  return [type, media?.schema];
}

/** Build a response with an optional body and standard rate-limit headers. */
function makeResponse(
  description: string,
  schema?: OpenApiSchema,
  rateLimited = false,
  mediaType = "application/json",
): OpenApiResponse {
  return {
    description,
    ...(schema === undefined ? {} : { content: { [mediaType]: { schema } } }),
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

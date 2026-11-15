import { Effect } from "effect";
import { observeOpenApi } from "./generate-observability.js";
import {
  PROBLEM,
  PROBLEM_REFERENCE,
  problemSchema,
  rateLimitHeaders,
  rateLimitSchema,
  validationSchema,
} from "./generate-problem.js";
import type {
  FunctionNode,
  JsonValue,
  OpenApiResponse,
  OpenApiSchema,
} from "./generate-response.types.js";

/** Project the responses a function's route declares.
 * @param values - Serializable response declarations.
 * @param target - Target function and error definitions.
 * @returns Effect containing status-indexed responses; no expected failure. The statuses the
 *   runtime sends beyond these come from `runtimeProblems`.
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
              : (schema ??
                  (rateLimited ? rateLimitSchema : problem ? PROBLEM_REFERENCE : undefined)),
            rateLimited,
            problem ? PROBLEM : "application/json",
          );
          const previous = result[status];
          result[status] = previous === undefined ? next : mergeResponses(previous, next);
        }
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

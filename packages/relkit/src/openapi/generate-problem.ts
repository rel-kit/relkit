/** The Problem Details responses the runtime sends by itself, projected for each operation. */
import type { JsonValue, OpenApiResponse, OpenApiSchema } from "./generate-response.types.js";

/** Media type of every RelKit error body. */
export const PROBLEM = "application/problem+json";

/** Name of the shared Problem schema in `components.schemas`. */
export const PROBLEM_SCHEMA = "Problem";

/** A reference to the shared Problem schema, for a response that declares no body of its own. */
export const PROBLEM_REFERENCE: OpenApiSchema = { $ref: `#/components/schemas/${PROBLEM_SCHEMA}` };

/** The Problem Details body every RelKit error response has, narrowed by `fields`.
 * @param required - Fields the narrowed problem always has, beyond the common ones.
 * @param fields - Property schemas that replace or add to the common ones.
 * @returns A JSON Schema for the problem body.
 */
export function problemSchema(
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
      requestId: { type: "string" },
      ...fields,
    },
  };
}

const validationFields = {
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
} as const;

/** The validation problem: `issues` lists each failed field.
 * @example validationSchema.required; // ["type", "title", "status", "code", "detail", "issues"]
 */
export const validationSchema = problemSchema(["issues"], validationFields);

const rateLimitData = {
  type: "object",
  required: ["retryAfterMs"],
  properties: { retryAfterMs: { type: "integer", minimum: 0 } },
} as const;

/** The problem a rate-limited route answers with, 429.
 * @example rateLimitSchema.required; // [..., "data"]
 */
export const rateLimitSchema = problemSchema(["data"], {
  type: { const: "/errors/rate-limited", type: "string" },
  status: { const: 429, type: "integer" },
  code: { const: "rate-limited", type: "string" },
  data: rateLimitData,
});

/** Standard rate-limit headers a rate-limited route sets on every answer. */
export const rateLimitHeaders = {
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

/** The shared Problem schema as a component.
 * @returns The common Problem Details schema every generated error response refers to.
 */
export function problemComponent(): OpenApiSchema {
  return problemSchema();
}

/** A Problem Details response that refers to the shared schema.
 * @param description - What the status means for the operation.
 * @param narrow - Properties this status fixes, and the ones it always carries.
 * @returns The response, with the shared schema alone or narrowed through `allOf`.
 * @example problemResponse("Payload too large", { code: { const: "payload-too-large" } });
 */
export function problemResponse(
  description: string,
  narrow?: {
    readonly properties: Readonly<Record<string, JsonValue>>;
    readonly required?: string[];
  },
): OpenApiResponse {
  const schema: OpenApiSchema =
    narrow === undefined
      ? PROBLEM_REFERENCE
      : {
          allOf: [
            PROBLEM_REFERENCE,
            {
              type: "object",
              properties: narrow.properties,
              ...(narrow.required === undefined ? {} : { required: narrow.required }),
            },
          ],
        };
  return { description, content: { [PROBLEM]: { schema } } };
}

/** What decides the answers the runtime can send for one function-backed operation. */
export interface RuntimeProblemInput {
  /** A request body can exist: the request mapping reads one. */
  readonly body: boolean;
  /** The operation reads input that can fail validation. */
  readonly input: boolean;
  /** A rate limit applies to the route. */
  readonly rateLimited: boolean;
}

/** The statuses the runtime sends for an operation beyond its declared responses.
 * @param input - Whether the operation reads a body, reads input and is rate limited.
 * @returns 422 when it reads input, 413 when it can have a body, 429 when rate limited, and 500.
 * @example runtimeProblems({ body: true, input: true, rateLimited: false }); // 413, 422, 500
 */
export function runtimeProblems(input: RuntimeProblemInput): Record<string, OpenApiResponse> {
  return {
    ...(input.input
      ? {
          "422": problemResponse("Validation error", {
            properties: validationFields,
            required: ["issues"],
          }),
        }
      : {}),
    ...(input.body
      ? {
          "413": problemResponse("The request body exceeds the byte limit", {
            properties: {
              type: { const: "/errors/payload-too-large", type: "string" },
              status: { const: 413, type: "integer" },
              code: { const: "payload-too-large", type: "string" },
            },
          }),
        }
      : {}),
    ...(input.rateLimited
      ? {
          "429": {
            ...problemResponse("Rate limit exceeded", {
              properties: {
                type: { const: "/errors/rate-limited", type: "string" },
                status: { const: 429, type: "integer" },
                code: { const: "rate-limited", type: "string" },
                data: rateLimitData,
              },
              required: ["data"],
            }),
            headers: rateLimitHeaders,
          },
        }
      : {}),
    "500": problemResponse("The request failed unexpectedly"),
  };
}

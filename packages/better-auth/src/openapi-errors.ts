/**
 * Declares the error body Better Auth's endpoints send. The SDK's generator gives every error
 * response an inline schema with `message` alone; the endpoints send `message`, in most cases
 * `code`, `issues` on a validation failure, or no body at all. Those errors keep their format
 * (clients built on the SDK read it), so the document says what it is. The shapes were measured on
 * a served application and read from the SDK's error constructors.
 */
import type { JsonValue } from "relkit/contracts";

type JsonObject = { [key: string]: JsonValue };

/** Component name of the error body, already carrying the projection's prefix. */
export const AUTH_ERROR = "BetterAuthError";
const JSON_TYPE = "application/json";
const PROBLEM_TYPE = "application/problem+json";
/** Methods RelKit's transport policy checks for origin and CSRF before Better Auth runs. */
const STATE_CHANGING = new Set(["post", "put", "patch", "delete"]);

/** A reference to the shared error schema. */
export const authErrorReference = (): JsonObject => ({
  $ref: `#/components/schemas/${AUTH_ERROR}`,
});

/**
 * The body of an error from a Better Auth endpoint.
 * @returns A fresh schema: `message` is always present when there is a body.
 */
export function authErrorSchema(): JsonObject {
  return {
    type: "object",
    description:
      "An error from a Better Auth endpoint, in Better Auth's own format and not Problem Details. " +
      "Some errors, such as a missing session on an organization endpoint, are sent with no body.",
    required: ["message"],
    properties: {
      message: { type: "string", description: "What went wrong, as text for people." },
      code: {
        type: "string",
        description:
          "Better Auth's code for the error, such as `INVALID_EMAIL_OR_PASSWORD`. A few errors carry none.",
      },
      issues: {
        type: "array",
        description:
          "The failing fields of a validation error, whose `code` is `VALIDATION_ERROR`.",
        items: {
          type: "object",
          required: ["path", "message"],
          properties: {
            path: { type: "string", description: "The field, such as `body.email`." },
            message: { type: "string" },
            option: {
              type: "integer",
              description: "Which of the accepted input shapes the field belongs to, from 1.",
            },
          },
        },
      },
    },
  };
}

/**
 * Points an operation's error responses at the shared schema and lists the Problem that RelKit's
 * transport policy sends for a state-changing request before Better Auth runs.
 * @param responses - The operation's responses by status.
 * @param method - Lower-case HTTP method of the operation.
 * @param problem - Reference to the Problem Details component.
 * @returns A copy; a response the SDK describes in any other way than its generic form is kept.
 */
export function declareAuthErrors(
  responses: JsonObject,
  method: string,
  problem: JsonObject,
): JsonObject {
  const declared = Object.fromEntries(
    Object.entries(responses).map(([status, response]) => [
      status,
      /^[45]\d\d$/.test(status) ? withErrorSchema(response) : response,
    ]),
  );
  const forbidden = declared["403"];
  if (!STATE_CHANGING.has(method) || !isRecord(forbidden) || !isRecord(forbidden.content))
    return declared;
  if (forbidden.content[JSON_TYPE] === undefined || forbidden.content[PROBLEM_TYPE] !== undefined)
    return declared;
  return {
    ...declared,
    "403": { ...forbidden, content: { ...forbidden.content, [PROBLEM_TYPE]: { schema: problem } } },
  };
}

/** Replaces the generator's `message`-only schema of one response's JSON body. */
function withErrorSchema(response: JsonValue): JsonValue {
  if (!isRecord(response) || !isRecord(response.content)) return response;
  const json = response.content[JSON_TYPE];
  if (!isRecord(json) || !isGenericError(json.schema)) return response;
  return {
    ...response,
    content: { ...response.content, [JSON_TYPE]: { ...json, schema: authErrorReference() } },
  };
}

/** The generator's form: an object whose only property is a string `message`. */
function isGenericError(schema: JsonValue | undefined): boolean {
  if (!isRecord(schema) || schema.type !== "object" || !isRecord(schema.properties)) return false;
  const names = Object.keys(schema.properties);
  const message = schema.properties.message;
  return names.length === 1 && isRecord(message) && message.type === "string";
}

/** Recognizes JSON objects before reading their properties. */
function isRecord(value: JsonValue | undefined): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

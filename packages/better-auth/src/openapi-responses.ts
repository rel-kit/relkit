/**
 * Corrects the responses Better Auth's generator gets wrong and adds the answers its operations
 * send that it does not declare. Each correction was read from the SDK's source and applies only
 * when the document still holds the wrong form, so a release that fixes it is left alone.
 */
import type { JsonValue } from "relkit/contracts";
import { problemSchema } from "relkit/openapi";
import {
  AUTH_ERROR,
  authErrorReference,
  authErrorSchema,
  declareAuthErrors,
} from "./openapi-errors.js";

type JsonObject = { [key: string]: JsonValue };

const PREFIX = "BetterAuth";
const PROBLEM = `${PREFIX}Problem`;
const JSON_TYPE = "application/json";
const PROBLEM_TYPE = "application/problem+json";
const schemaRef = (name: string): JsonObject => ({ $ref: `#/components/schemas/${PREFIX}${name}` });
const jsonBody = (description: string, schema: JsonValue): JsonObject => ({
  description,
  content: { [JSON_TYPE]: { schema } },
});

/** The member row `listMembers` returns: the member with the user it belongs to. */
const memberWithUser: JsonObject = {
  allOf: [
    schemaRef("Member"),
    {
      type: "object",
      required: ["user"],
      properties: {
        user: {
          type: "object",
          required: ["id", "name", "email"],
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            email: { type: "string" },
            image: { type: ["string", "null"] },
          },
        },
      },
    },
  ],
};

/** The success answers the SDK sends for operations its generator describes wrongly or not at all. */
const SUCCESS: Readonly<Record<string, JsonObject>> = {
  "POST /organization/delete": jsonBody(
    "The organization that was deleted",
    schemaRef("Organization"),
  ),
  "POST /organization/check-slug": jsonBody("The slug is free", {
    type: "object",
    required: ["status"],
    properties: { status: { type: "boolean" } },
  }),
  "GET /organization/list-invitations": jsonBody("The organization's invitations", {
    type: "array",
    items: schemaRef("Invitation"),
  }),
  "GET /organization/list-members": jsonBody("A page of the organization's members", {
    type: "object",
    required: ["members", "total"],
    properties: { members: { type: "array", items: memberWithUser }, total: { type: "integer" } },
  }),
};

/**
 * Applies the corrections to an already mounted and renamed document.
 * @param document - Document with `paths` and `components`.
 * @param basePath - Mount of the auth endpoints, without a trailing slash.
 * @returns A copy with corrected success answers, nullable `user.image`, the 413 and 415 answers
 * of operations that take a body, and the error body the endpoints send.
 */
export function correctAuthResponses(document: JsonObject, basePath: string): JsonObject {
  const paths = record(document.paths);
  const corrected = Object.fromEntries(
    Object.entries(paths).map(([path, item]) => [
      path,
      Object.fromEntries(
        Object.entries(record(item)).map(([method, operation]) => [
          method,
          isOperation(operation)
            ? correctOperation(
                operation,
                `${method.toUpperCase()} ${path.slice(basePath.length)}`,
                method,
              )
            : operation,
        ]),
      ),
    ]),
  );
  return { ...document, paths: corrected, components: correctComponents(document.components) };
}

/** Corrects one operation, keyed by method and unmounted path. */
function correctOperation(operation: JsonObject, key: string, method: string): JsonObject {
  const responses = { ...record(operation.responses) };
  const success = SUCCESS[key];
  if (success !== undefined && wrongSuccess(responses["200"], key)) responses["200"] = success;
  const hasPermission = key === "POST /organization/has-permission";
  const nullable = hasPermission ? nullableError(responses["200"]) : undefined;
  if (nullable !== undefined) responses["200"] = nullable;
  if (operation.requestBody !== undefined) {
    responses["413"] ??= {
      description: "The request body exceeds the server's byte limit",
      content: { [PROBLEM_TYPE]: { schema: { $ref: `#/components/schemas/${PROBLEM}` } } },
    };
    responses["415"] ??= jsonBody(
      "The Content-Type is not one the operation accepts",
      authErrorReference(),
    );
  }
  const problem = { $ref: `#/components/schemas/${PROBLEM}` };
  return { ...operation, responses: declareAuthErrors(responses, method, problem) };
}

/** Whether an operation's 200 is missing or still the form the generator got wrong. */
function wrongSuccess(response: JsonValue | undefined, key: string): boolean {
  if (response === undefined) return true;
  // `organization/delete` documents the id as a string, but the SDK returns the organization.
  return key === "POST /organization/delete" && schemaOf(response)?.type === "string";
}

/** `has-permission` sends `error: null` beside `success`; the generator says string. */
function nullableError(response: JsonValue | undefined): JsonValue | undefined {
  const schema = schemaOf(response);
  const error = record(schema?.properties).error;
  if (response === undefined || schema === undefined || !isRecord(error) || error.type !== "string")
    return undefined;
  const properties = {
    ...record(schema.properties),
    error: { ...error, type: ["string", "null"] },
  };
  return jsonBody(String(record(response).description ?? "Success"), { ...schema, properties });
}

/** The schema of a response's JSON body. */
function schemaOf(response: JsonValue | undefined): JsonObject | undefined {
  const schema = record(record(record(record(response).content)[JSON_TYPE]).schema);
  return Object.keys(schema).length === 0 ? undefined : schema;
}

/** Components: `user.image` is `string | null | undefined` in the SDK; add the error and problem schemas. */
function correctComponents(components: JsonValue | undefined): JsonObject {
  const schemas = record(record(components).schemas);
  const user = record(schemas[`${PREFIX}User`]);
  const image = record(record(user.properties).image);
  const patched =
    image.type === "string"
      ? {
          ...user,
          properties: { ...record(user.properties), image: { ...image, type: ["string", "null"] } },
        }
      : user;
  return {
    ...record(components),
    schemas: {
      ...schemas,
      ...(Object.keys(user).length === 0 ? {} : { [`${PREFIX}User`]: patched }),
      [AUTH_ERROR]: authErrorSchema(),
      [PROBLEM]: problemSchema(),
    },
  };
}

/** An operation object: one with a `responses` map. */
function isOperation(value: JsonValue | undefined): value is JsonObject {
  return isRecord(value) && isRecord(value.responses);
}

/** The object, or an empty one when the value is not an object. */
function record(value: JsonValue | undefined): JsonObject {
  return isRecord(value) ? value : {};
}

/** Recognizes JSON objects before reading their properties. */
function isRecord(value: JsonValue | undefined): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

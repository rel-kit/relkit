import { assertJsonValue, deepFreeze, isStableId, normalizeId } from "@relkit/contracts";
import type { StandardSchemaV1 } from "@relkit/schema";
import type {
  ContinueMapping,
  HttpDsl,
  HttpMappingNode,
  HttpMappingShape,
  HttpResponseMapping,
  HttpSourceOptions,
  HttpTransformRef,
  HttpTransformMapping,
  HttpInputMapping,
  HttpNestedMapping,
} from "./http-dsl.types.js";
import { assertMappingValue } from "./http-dsl-mapping-validation.js";
import { assertResponseValue } from "./http-dsl-response-validation.js";
import {
  assertSchemaValue,
  isRecordValue,
  isSchemaValue,
  isStatusValue,
} from "./http-dsl-value-validation.js";
import { RouteInputError } from "./route-observability.js";

/** Internal pure constructors evaluated only inside the public Effect operations. */
export const httpValue: HttpDsl = {
  input: (fields) => makeObject("input", fields) as HttpInputMapping<typeof fields>,
  nested: (fields) => makeObject("nested", fields) as HttpNestedMapping<typeof fields>,
  path: ((name: string, options?: HttpSourceOptions) =>
    source("path", name, options)) as HttpDsl["path"],
  pathSegments: ((name: string, options?: HttpSourceOptions) =>
    source("path-segments", name, options)) as HttpDsl["pathSegments"],
  query: ((name: string, options?: HttpSourceOptions) =>
    source("query", name, options)) as HttpDsl["query"],
  header: ((name: string, options?: HttpSourceOptions) =>
    source("header", name, options)) as HttpDsl["header"],
  cookie: ((name: string, options?: HttpSourceOptions) =>
    source("cookie", name, options)) as HttpDsl["cookie"],
  body: ((name?: string, options?: HttpSourceOptions) =>
    name === undefined ? httpValue.wholeBody() : source("body", name, options)) as HttpDsl["body"],
  wholeBody: () => deepFreeze({ kind: "whole-body" }),
  multipart: ((name: string, options?: HttpSourceOptions) =>
    source("multipart", name, options)) as HttpDsl["multipart"],
  multipartAll: ((name: string, options?: HttpSourceOptions) =>
    source("multipart-all", name, options)) as HttpDsl["multipartAll"],
  constant: (value) => {
    assertJsonValue(value);
    return deepFreeze({ kind: "constant" as const, value });
  },
  optional: (value) => {
    assertMappingValue(value);
    return deepFreeze({ kind: "optional" as const, value });
  },
  default: (value, fallback) => {
    assertMappingValue(value);
    assertJsonValue(fallback);
    return deepFreeze({ kind: "default" as const, value, default: fallback });
  },
  transform: transformMapping as HttpDsl["transform"],
  success: (status, schema) => response("success", `success.${status}`, status, schema),
  error: (errorId, status, schema) =>
    response(
      "error",
      `error.${normalizeId(errorId)}.${status}`,
      status,
      schema,
      normalizeId(errorId),
    ),
  validationError: (status = 422, schema) =>
    response("validation-error", `validation.${status}`, status, schema),
  response: (id, status, schema) => response("response", id, status, schema),
  continue: (): ContinueMapping => deepFreeze({ kind: "continue" }),
  respond: (value, body) => {
    const responseId =
      typeof value === "string" ? normalizeId(value) : assertResponseValue(value).id;
    if (body !== undefined) assertMappingValue(body);
    return deepFreeze({
      kind: "respond" as const,
      responseId,
      ...(body === undefined ? {} : { body }),
    });
  },
};

function source(kind: string, name: string, options?: HttpSourceOptions): HttpMappingNode {
  if (typeof name !== "string" || name.trim() === "")
    throw new RouteInputError("HTTP mapping name must be non-empty");
  const value = deepFreeze({ kind, name }) as HttpMappingNode;
  if (options?.default !== undefined) return httpValue.default(value, options.default);
  return options?.optional === true ? httpValue.optional(value) : value;
}

function transformMapping<T extends HttpTransformRef | string, M extends HttpMappingNode>(
  transform: T,
  value?: M,
): HttpTransformMapping<unknown> {
  const input: HttpMappingNode = value ?? httpValue.wholeBody();
  assertMappingValue(input);
  if (typeof transform !== "string" && !isTransformRefValue(transform))
    throw new RouteInputError("HTTP transform must be named");
  const transformId = typeof transform === "string" ? normalizeId(transform) : transform.ref.id;
  return deepFreeze({ kind: "transform" as const, transformId, value: input });
}
function response(
  kind: HttpResponseMapping["kind"],
  id: string,
  status: number,
  schema?: StandardSchemaV1,
  errorId?: string,
): HttpResponseMapping {
  if (!isStatusValue(status))
    throw new RouteInputError("HTTP response status must be an integer from 100 through 599");
  if (schema !== undefined) assertSchemaValue(schema, "response schema");
  return deepFreeze({
    kind,
    id: normalizeId(id),
    status,
    ...(errorId === undefined ? {} : { errorId }),
    ...(schema === undefined ? {} : { schema }),
  });
}
function makeObject<S extends HttpMappingShape>(kind: "input" | "nested", fields: S): object {
  if (!isRecordValue(fields) || Object.getOwnPropertySymbols(fields).length > 0)
    throw new RouteInputError("HTTP mapping fields must be an object");
  for (const [name, value] of Object.entries(fields)) {
    if (name.length === 0) throw new RouteInputError("HTTP mapping field must be non-empty");
    assertMappingValue(value);
  }
  return deepFreeze({ kind, fields: { ...fields } });
}

/** Checks a transform reference without running another Effect adapter.
 * @param value - Candidate transform reference.
 * @returns Whether it has a stable ID and a Standard Schema.
 * @example isTransformRefValue({ ref: { kind: "transform", id: "x" }, schema });
 */
export function isTransformRefValue(value: unknown): value is HttpTransformRef {
  return (
    isRecordValue(value) &&
    isRecordValue(value.ref) &&
    value.ref.kind === "transform" &&
    isStableId(value.ref.id) &&
    isSchemaValue(value.schema)
  );
}

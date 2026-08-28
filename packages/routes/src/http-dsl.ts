import {
  assertJsonValue,
  deepFreeze,
  isStableId,
  normalizeId,
  type JsonValue,
} from "@relkit/contracts";
import { createUnboundIdentity } from "@relkit/invocation";
import type { StandardSchemaV1 } from "@relkit/schema";
import type {
  ContinueMapping,
  DefineTransformOptions,
  HttpDsl,
  HttpMapping,
  HttpMappingNode,
  HttpMappingShape,
  HttpRequestMapping,
  HttpResponseMapping,
  HttpSourceOptions,
  HttpTransformDescriptor,
  HttpTransformRef,
  HttpTransformMapping,
  HttpInputMapping,
  HttpNestedMapping,
} from "./http-dsl-types.js";
import {
  assertMapping,
  assertRequestMapping,
  assertResponse,
  assertSchema,
  isHttpMapping,
  isHttpRequestMapping,
  isHttpResponseMapping,
  isMiddlewareDecision,
  isRecord,
  isSchema,
  isStatus,
} from "./http-dsl-validation.js";

export type * from "./http-dsl-types.js";
export {
  assertRequestMapping,
  assertResponse,
  isHttpMapping,
  isHttpRequestMapping,
  isHttpResponseMapping,
  isMiddlewareDecision,
} from "./http-dsl-validation.js";

export function defineTransform<const Id extends string, const Schema extends StandardSchemaV1>(
  options: DefineTransformOptions<Id, Schema>,
): HttpTransformDescriptor<Id, Schema> {
  if (hasOwn(options, "handler") || hasOwn(options, "transform"))
    throw new TypeError("HTTP transforms cannot own handlers or closures");
  assertSchema(options.schema, "schema");
  const id = normalizeId(
    options.id === undefined ? createUnboundIdentity() : options.id,
  ) as unknown as Id;
  return deepFreeze({
    kind: "transform" as const,
    id,
    ref: Object.freeze({ kind: "transform" as const, id }),
    schema: options.schema,
    ...(options.title === undefined ? {} : { title: options.title }),
    ...(options.description === undefined ? {} : { description: options.description }),
    ...(options.tags === undefined ? {} : { tags: Object.freeze([...options.tags]) }),
  }) as HttpTransformDescriptor<Id, Schema>;
}
export const defineRequestTransform = defineTransform;

export function isTransformRef(value: unknown): value is HttpTransformRef {
  return (
    isRecord(value) &&
    isRecord(value.ref) &&
    value.ref.kind === "transform" &&
    isStableId(value.ref.id) &&
    isSchema(value.schema)
  );
}

/**
 * Creates serializable HTTP request, response, transform, and policy mappings.
 *
 * @example
 * ```ts
 * import { http } from "@relkit/app/routes"
 *
 * const request = http.input({ id: http.path("id"), token: http.header("authorization") })
 * void request
 * ```
 * @category HTTP
 * @since 0.1.0
 */
export const http: HttpDsl = {
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
    name === undefined ? http.wholeBody() : source("body", name, options)) as HttpDsl["body"],
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
    assertMapping(value);
    return deepFreeze({ kind: "optional" as const, value });
  },
  default: (value, fallback) => {
    assertMapping(value);
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
    const responseId = typeof value === "string" ? normalizeId(value) : assertResponse(value).id;
    if (body !== undefined) assertMapping(body);
    return deepFreeze({
      kind: "respond" as const,
      responseId,
      ...(body === undefined ? {} : { body }),
    });
  },
};

function source(kind: string, name: string, options?: HttpSourceOptions): HttpMappingNode {
  if (typeof name !== "string" || name.trim() === "")
    throw new TypeError("HTTP mapping name must be non-empty");
  const value = deepFreeze({ kind, name }) as HttpMappingNode;
  if (options?.default !== undefined) return http.default(value, options.default);
  return options?.optional === true ? http.optional(value) : value;
}

function transformMapping<T extends HttpTransformRef | string, M extends HttpMappingNode>(
  transform: T,
  value?: M,
): HttpTransformMapping<unknown> {
  const input: HttpMappingNode = value ?? http.wholeBody();
  assertMapping(input);
  if (typeof transform !== "string" && !isTransformRef(transform))
    throw new TypeError("HTTP transform must be named");
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
  if (!isStatus(status))
    throw new TypeError("HTTP response status must be an integer from 100 through 599");
  if (schema !== undefined) assertSchema(schema, "response schema");
  return deepFreeze({
    kind,
    id: normalizeId(id),
    status,
    ...(errorId === undefined ? {} : { errorId }),
    ...(schema === undefined ? {} : { schema }),
  });
}
function makeObject<S extends HttpMappingShape>(kind: "input" | "nested", fields: S): object {
  if (!isRecord(fields) || Object.getOwnPropertySymbols(fields).length > 0)
    throw new TypeError("HTTP mapping fields must be an object");
  for (const [name, value] of Object.entries(fields)) {
    if (name.length === 0) throw new TypeError("HTTP mapping field must be non-empty");
    assertMapping(value);
  }
  return deepFreeze({ kind, fields: { ...fields } });
}
function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

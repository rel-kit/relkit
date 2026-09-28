import { deepFreeze, normalizeId } from "@relkit/contracts";
import type { StandardSchemaV1 } from "@relkit/schema";
import { Effect } from "effect";
import type {
  DefineTransformOptions,
  HttpDsl,
  HttpSourceOptions,
  HttpTransformDescriptor,
  HttpTransformRef,
} from "./http-dsl.types.js";
import { assertSchemaValue } from "./http-dsl-value-validation.js";
import { httpEffects } from "./http-dsl-operations.js";
import { isTransformRefValue } from "./http-dsl-values.js";
import {
  RouteInputError,
  measureRoute,
  routeAttempt,
  routeIdentity,
  routeTry,
  runRouteSync,
} from "./route-observability.js";

export type * from "./http-dsl.types.js";
export {
  assertRequestMapping,
  assertRequestMappingEffect,
  assertResponse,
  assertResponseEffect,
  isHttpMapping,
  isHttpMappingEffect,
  isHttpRequestMapping,
  isHttpRequestMappingEffect,
  isHttpResponseMapping,
  isHttpResponseMappingEffect,
  isMiddlewareDecision,
  isMiddlewareDecisionEffect,
} from "./http-dsl-validation.js";
export { httpEffects } from "./http-dsl-operations.js";

/** Defines a serializable transform through Effect.
 * @param options - Schema, optional ID, and display metadata.
 * @returns Frozen descriptor or tagged invalid-input failure.
 * @example Effect.runSync(defineTransformEffect({ schema }));
 */
export const defineTransformEffect = Effect.fn("routes.dsl.define-transform")(
  <const Id extends string, const Schema extends StandardSchemaV1>(
    options: DefineTransformOptions<Id, Schema>,
  ) =>
    measureRoute(
      "dsl.define-transform",
      Effect.gen(function* () {
        yield* routeAttempt("dsl.define-transform", () => {
          if (options === null || typeof options !== "object" || Array.isArray(options))
            throw new RouteInputError("HTTP transform options must be an object");
          if (hasOwn(options, "handler") || hasOwn(options, "transform"))
            throw new RouteInputError("HTTP transforms cannot own handlers or closures");
          assertSchemaValue(options.schema, "schema");
        });
        const id =
          options.id === undefined ? yield* routeIdentity("dsl.define-transform") : options.id;
        return yield* routeAttempt("dsl.define-transform", () => defineTransformValue(options, id));
      }),
    ),
);

/** Defines a serializable HTTP transform.
 * @param options - Schema, optional ID, and display metadata.
 * @returns Frozen transform descriptor.
 * @throws TypeError for invalid input or a closure-bearing transform.
 * @example defineTransform({ schema });
 */
export function defineTransform<const Id extends string, const Schema extends StandardSchemaV1>(
  options: DefineTransformOptions<Id, Schema>,
): HttpTransformDescriptor<Id, Schema> {
  return runRouteSync(defineTransformEffect(options));
}

/** Alias for request transform definitions.
 * @param options - Transform schema and metadata.
 * @returns Frozen transform descriptor.
 * @throws TypeError for invalid transform input.
 * @example defineRequestTransform({ schema });
 */
export const defineRequestTransform = defineTransform;

/** Effect alias for request transform definitions.
 * @param options - Transform schema and metadata.
 * @returns Descriptor or tagged invalid-input failure.
 * @example Effect.runSync(defineRequestTransformEffect({ schema }));
 */
export const defineRequestTransformEffect = defineTransformEffect;

function defineTransformValue<const Id extends string, const Schema extends StandardSchemaV1>(
  options: DefineTransformOptions<Id, Schema>,
  identity: string,
): HttpTransformDescriptor<Id, Schema> {
  const id = normalizeId(identity) as unknown as Id;
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

/** Checks a transform reference through Effect.
 * @param value - Candidate transform reference.
 * @returns Whether the reference has a stable ID and schema.
 * @example Effect.runSync(isTransformRefEffect(transform));
 */
export const isTransformRefEffect = Effect.fn("routes.dsl.is-transform-ref")((value: unknown) =>
  routeTry("dsl.is-transform-ref", () => isTransformRefValue(value)),
);

/** Checks a transform reference synchronously.
 * @param value - Candidate transform reference.
 * @returns Whether the reference has a stable ID and schema.
 * @example isTransformRef(transform);
 */
export function isTransformRef(value: unknown): value is HttpTransformRef {
  return runRouteSync(isTransformRefEffect(value));
}

/** Creates serializable HTTP request and response mappings.
 * @returns A synchronous facade for the corresponding `httpEffects` operations.
 * @example const request = http.input({ id: http.path("id") });
 */
export const http: HttpDsl = {
  input: (fields) => runRouteSync(httpEffects.input(fields)),
  nested: (fields) => runRouteSync(httpEffects.nested(fields)),
  path: ((name: string, options?: HttpSourceOptions) =>
    runRouteSync(httpEffects.path(name, options))) as HttpDsl["path"],
  pathSegments: ((name: string, options?: HttpSourceOptions) =>
    runRouteSync(httpEffects.pathSegments(name, options))) as HttpDsl["pathSegments"],
  query: ((name: string, options?: HttpSourceOptions) =>
    runRouteSync(httpEffects.query(name, options))) as HttpDsl["query"],
  header: ((name: string, options?: HttpSourceOptions) =>
    runRouteSync(httpEffects.header(name, options))) as HttpDsl["header"],
  cookie: ((name: string, options?: HttpSourceOptions) =>
    runRouteSync(httpEffects.cookie(name, options))) as HttpDsl["cookie"],
  body: ((name?: string, options?: HttpSourceOptions) =>
    runRouteSync(httpEffects.body(name, options))) as HttpDsl["body"],
  wholeBody: () => runRouteSync(httpEffects.wholeBody()),
  multipart: ((name: string, options?: HttpSourceOptions) =>
    runRouteSync(httpEffects.multipart(name, options))) as HttpDsl["multipart"],
  multipartAll: ((name: string, options?: HttpSourceOptions) =>
    runRouteSync(httpEffects.multipartAll(name, options))) as HttpDsl["multipartAll"],
  constant: (value) => runRouteSync(httpEffects.constant(value)),
  optional: (value) => runRouteSync(httpEffects.optional(value)),
  default: (value, fallback) => runRouteSync(httpEffects.default(value, fallback)),
  transform: ((
    transform: HttpTransformRef | string,
    value?: import("./http-dsl.types.js").HttpMappingNode,
  ) => runRouteSync(httpEffects.transform(transform, value))) as HttpDsl["transform"],
  success: (status, schema) => runRouteSync(httpEffects.success(status, schema)),
  error: (errorId, status, schema) => runRouteSync(httpEffects.error(errorId, status, schema)),
  validationError: (status, schema) => runRouteSync(httpEffects.validationError(status, schema)),
  response: (id, status, schema) => runRouteSync(httpEffects.response(id, status, schema)),
  continue: () => runRouteSync(httpEffects.continue()),
  respond: (response, body) => runRouteSync(httpEffects.respond(response, body)),
};

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

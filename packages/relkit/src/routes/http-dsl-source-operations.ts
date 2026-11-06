import { Effect } from "effect";
import type { HttpMappingShape, HttpSourceOptions } from "./http-dsl.types.js";
import { httpValue } from "./http-dsl-values.js";
import { routeTry } from "./route-observability.js";

/** Effect constructors for request input and source mappings.
 * @example Effect.runSync(httpSourceEffects.path("id"));
 */
export const httpSourceEffects = {
  /** Builds a root request mapping.
   * @param fields - Serializable field mappings.
   * @returns Effect yielding an input mapping or RouteOperationError.
   * @example Effect.runSync(httpSourceEffects.input({}));
   */
  input: Effect.fn("routes.dsl.input")(<const S extends HttpMappingShape>(fields: S) =>
    routeTry("dsl.input", () => httpValue.input(fields)),
  ),
  /** Builds a nested field mapping.
   * @param fields - Serializable field mappings.
   * @returns Effect yielding a nested mapping or RouteOperationError.
   * @example Effect.runSync(httpSourceEffects.nested({}));
   */
  nested: Effect.fn("routes.dsl.nested")(<const S extends HttpMappingShape>(fields: S) =>
    routeTry("dsl.nested", () => httpValue.nested(fields)),
  ),
  /** Maps a path parameter.
   * @param name - Path parameter name.
   * @param options - Optional source settings.
   * @returns Effect yielding a path mapping or RouteOperationError.
   * @example Effect.runSync(httpSourceEffects.path("id"));
   */
  path: Effect.fn("routes.dsl.path")((name: string, options?: HttpSourceOptions) =>
    routeTry("dsl.source", () =>
      options === undefined ? httpValue.path(name) : httpValue.path(name, options),
    ),
  ),
  /** Maps captured path segments.
   * @param name - Segment parameter name.
   * @param options - Optional source settings.
   * @returns Effect yielding a segment mapping or RouteOperationError.
   * @example Effect.runSync(httpSourceEffects.pathSegments("parts"));
   */
  pathSegments: Effect.fn("routes.dsl.path-segments")((name: string, options?: HttpSourceOptions) =>
    routeTry("dsl.source", () =>
      options === undefined ? httpValue.pathSegments(name) : httpValue.pathSegments(name, options),
    ),
  ),
  /** Maps a query parameter.
   * @param name - Query parameter name.
   * @param options - Optional source settings.
   * @returns Effect yielding a query mapping or RouteOperationError.
   * @example Effect.runSync(httpSourceEffects.query("page"));
   */
  query: Effect.fn("routes.dsl.query")((name: string, options?: HttpSourceOptions) =>
    routeTry("dsl.source", () =>
      options === undefined ? httpValue.query(name) : httpValue.query(name, options),
    ),
  ),
  /** Maps a request header.
   * @param name - Header name.
   * @param options - Optional source settings.
   * @returns Effect yielding a header mapping or RouteOperationError.
   * @example Effect.runSync(httpSourceEffects.header("authorization"));
   */
  header: Effect.fn("routes.dsl.header")((name: string, options?: HttpSourceOptions) =>
    routeTry("dsl.source", () =>
      options === undefined ? httpValue.header(name) : httpValue.header(name, options),
    ),
  ),
  /** Maps a request cookie.
   * @param name - Cookie name.
   * @param options - Optional source settings.
   * @returns Effect yielding a cookie mapping or RouteOperationError.
   * @example Effect.runSync(httpSourceEffects.cookie("session"));
   */
  cookie: Effect.fn("routes.dsl.cookie")((name: string, options?: HttpSourceOptions) =>
    routeTry("dsl.source", () =>
      options === undefined ? httpValue.cookie(name) : httpValue.cookie(name, options),
    ),
  ),
  /** Maps the whole body or a named body field.
   * @param name - Optional body field name.
   * @param options - Optional source settings.
   * @returns Effect yielding a body mapping or RouteOperationError.
   * @example Effect.runSync(httpSourceEffects.body("name"));
   */
  body: Effect.fn("routes.dsl.body")((name?: string, options?: HttpSourceOptions) =>
    routeTry("dsl.source", () =>
      name === undefined
        ? httpValue.body()
        : options === undefined
          ? httpValue.body(name)
          : httpValue.body(name, options),
    ),
  ),
  /** Maps the complete request body.
   * @returns Effect yielding a whole-body mapping or RouteOperationError.
   * @example Effect.runSync(httpSourceEffects.wholeBody());
   */
  wholeBody: Effect.fn("routes.dsl.whole-body")(() =>
    routeTry("dsl.whole-body", () => httpValue.wholeBody()),
  ),
  /** Maps one multipart form field.
   * @param name - Multipart field name.
   * @param options - Optional source settings.
   * @returns Effect yielding a multipart mapping or RouteOperationError.
   * @example Effect.runSync(httpSourceEffects.multipart("photo"));
   */
  multipart: Effect.fn("routes.dsl.multipart")((name: string, options?: HttpSourceOptions) =>
    routeTry("dsl.source", () =>
      options === undefined ? httpValue.multipart(name) : httpValue.multipart(name, options),
    ),
  ),
  /** Maps all values of a multipart form field.
   * @param name - Multipart field name.
   * @param options - Optional source settings.
   * @returns Effect yielding a multipart array mapping or RouteOperationError.
   * @example Effect.runSync(httpSourceEffects.multipartAll("files"));
   */
  multipartAll: Effect.fn("routes.dsl.multipart-all")((name: string, options?: HttpSourceOptions) =>
    routeTry("dsl.source", () =>
      options === undefined ? httpValue.multipartAll(name) : httpValue.multipartAll(name, options),
    ),
  ),
};

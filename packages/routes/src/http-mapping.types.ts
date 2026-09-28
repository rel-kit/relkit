import type { JsonValue } from "@relkit/contracts";

/** Base phantom output contract for every HTTP mapping.
 * @example const mapping: HttpMapping<string> = http.path("id");
 */
export interface HttpMapping<Output = unknown> {
  readonly __output?: Output;
}
/** Named fields in a nested or request input mapping.
 * @example const fields: HttpMappingShape = { id: http.path("id") };
 */
export type HttpMappingShape = Readonly<Record<string, HttpMappingNode>>;
/** Output shape inferred from named mapping fields.
 * @example type Output = MappingShapeOutput<{ id: HttpPathMapping }>;
 */
export type MappingShapeOutput<S extends HttpMappingShape> = {
  readonly [K in keyof S]: HttpMappingOutput<S[K]>;
};
/** Output value inferred from one mapping node.
 * @example type Output = HttpMappingOutput<HttpPathMapping>;
 */
export type HttpMappingOutput<M> = M extends HttpMapping<infer Output> ? Output : never;
/** One named route path parameter.
 * @example const mapping: HttpPathMapping = http.path("id");
 */
export interface HttpPathMapping<Output = string> extends HttpMapping<Output> {
  readonly kind: "path";
  readonly name: string;
}
/** All segments captured by a route path parameter.
 * @example const mapping: HttpPathSegmentsMapping = http.pathSegments("parts");
 */
export interface HttpPathSegmentsMapping<Output = readonly string[]> extends HttpMapping<Output> {
  readonly kind: "path-segments";
  readonly name: string;
}
/** One named query parameter.
 * @example const mapping: HttpQueryMapping = http.query("page");
 */
export interface HttpQueryMapping<Output = string> extends HttpMapping<Output> {
  readonly kind: "query";
  readonly name: string;
}
/** One named request header.
 * @example const mapping: HttpHeaderMapping = http.header("authorization");
 */
export interface HttpHeaderMapping<Output = string> extends HttpMapping<Output> {
  readonly kind: "header";
  readonly name: string;
}
/** One named request cookie.
 * @example const mapping: HttpCookieMapping = http.cookie("session");
 */
export interface HttpCookieMapping<Output = string> extends HttpMapping<Output> {
  readonly kind: "cookie";
  readonly name: string;
}
/** One named field from a request body.
 * @example const mapping: HttpBodyMapping = http.body("name");
 */
export interface HttpBodyMapping<Output = unknown> extends HttpMapping<Output> {
  readonly kind: "body";
  readonly name: string;
}
/** The complete request body.
 * @example const mapping: HttpWholeBodyMapping = http.wholeBody();
 */
export interface HttpWholeBodyMapping<Output = unknown> extends HttpMapping<Output> {
  readonly kind: "whole-body";
}
/** One multipart form field.
 * @example const mapping: HttpMultipartMapping = http.multipart("photo");
 */
export interface HttpMultipartMapping<Output = string | File> extends HttpMapping<Output> {
  readonly kind: "multipart";
  readonly name: string;
}
/** All values of a multipart form field.
 * @example const mapping: HttpMultipartAllMapping = http.multipartAll("files");
 */
export interface HttpMultipartAllMapping<
  Output = readonly (string | File)[],
> extends HttpMapping<Output> {
  readonly kind: "multipart-all";
  readonly name: string;
}
/** A serializable constant input.
 * @example const mapping: HttpConstantMapping<string> = http.constant("all");
 */
export interface HttpConstantMapping<
  Output extends JsonValue = JsonValue,
> extends HttpMapping<Output> {
  readonly kind: "constant";
  readonly value: Output;
}
/** A nested object assembled from field mappings.
 * @example const mapping: HttpNestedMapping = http.nested({ id: http.path("id") });
 */
export interface HttpNestedMapping<
  S extends HttpMappingShape = HttpMappingShape,
> extends HttpMapping<MappingShapeOutput<S>> {
  readonly kind: "nested";
  readonly fields: S;
}
/** The root request input assembled from field mappings.
 * @example const mapping: HttpInputMapping = http.input({ id: http.path("id") });
 */
export interface HttpInputMapping<
  S extends HttpMappingShape = HttpMappingShape,
> extends HttpMapping<MappingShapeOutput<S>> {
  readonly kind: "input";
  readonly fields: S;
}
/** A source mapping whose absence is allowed.
 * @example const mapping: HttpOptionalMapping = http.optional(http.query("page"));
 */
export interface HttpOptionalMapping<
  M extends HttpMappingNode = HttpMappingNode,
> extends HttpMapping<HttpMappingOutput<M> | undefined> {
  readonly kind: "optional";
  readonly value: M;
}
/** A source mapping with a serializable fallback.
 * @example const mapping: HttpDefaultMapping = http.default(http.query("page"), "1");
 */
export interface HttpDefaultMapping<
  M extends HttpMappingNode = HttpMappingNode,
  Default extends JsonValue = JsonValue,
> extends HttpMapping<Exclude<HttpMappingOutput<M>, undefined> | Default> {
  readonly kind: "default";
  readonly value: M;
  readonly default: Default;
}
/** A value transformed by a registered transform ID.
 * @example const mapping: HttpTransformMapping = http.transform("upper", http.body("name"));
 */
export interface HttpTransformMapping<Output = unknown> extends HttpMapping<Output> {
  readonly kind: "transform";
  readonly transformId: string;
  readonly value: HttpMappingNode;
}
/** Union of supported serializable request mapping nodes.
 * @example const mapping: HttpMappingNode = http.path("id");
 */
export type HttpMappingNode =
  | HttpPathMapping
  | HttpPathSegmentsMapping
  | HttpQueryMapping
  | HttpHeaderMapping
  | HttpCookieMapping
  | HttpBodyMapping
  | HttpWholeBodyMapping
  | HttpMultipartMapping
  | HttpMultipartAllMapping
  | HttpConstantMapping
  | HttpInputMapping
  | HttpNestedMapping
  | HttpOptionalMapping
  | HttpDefaultMapping
  | HttpTransformMapping;
/** The required root shape for explicit request mapping.
 * @example const mapping: HttpRequestMapping = http.input({ id: http.path("id") });
 */
export type HttpRequestMapping = HttpInputMapping;
/** Optionality and fallback options for one request source.
 * @example const options: HttpSourceOptions = { optional: true };
 */
export interface HttpSourceOptions {
  readonly optional?: boolean;
  readonly default?: JsonValue;
}

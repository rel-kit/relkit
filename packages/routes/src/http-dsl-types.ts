import type { DescriptorMetadata, JsonValue } from "@relkit/contracts";
import type { InferOutput, StandardSchemaV1 } from "@relkit/schema";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS" | "ALL";
export type HttpRequestContentType = "application/json" | "multipart/form-data";
export interface HttpMapping<Output = unknown> {
  readonly __output?: Output;
}
export type HttpMappingShape = Readonly<Record<string, HttpMappingNode>>;
export type MappingShapeOutput<S extends HttpMappingShape> = {
  readonly [K in keyof S]: HttpMappingOutput<S[K]>;
};
export type HttpMappingOutput<M> = M extends HttpMapping<infer Output> ? Output : never;
export interface HttpPathMapping<Output = string> extends HttpMapping<Output> {
  readonly kind: "path";
  readonly name: string;
}
export interface HttpPathSegmentsMapping<Output = readonly string[]> extends HttpMapping<Output> {
  readonly kind: "path-segments";
  readonly name: string;
}
export interface HttpQueryMapping<Output = string> extends HttpMapping<Output> {
  readonly kind: "query";
  readonly name: string;
}
export interface HttpHeaderMapping<Output = string> extends HttpMapping<Output> {
  readonly kind: "header";
  readonly name: string;
}
export interface HttpCookieMapping<Output = string> extends HttpMapping<Output> {
  readonly kind: "cookie";
  readonly name: string;
}
export interface HttpBodyMapping<Output = unknown> extends HttpMapping<Output> {
  readonly kind: "body";
  readonly name: string;
}
export interface HttpWholeBodyMapping<Output = unknown> extends HttpMapping<Output> {
  readonly kind: "whole-body";
}
export interface HttpMultipartMapping<Output = string | File> extends HttpMapping<Output> {
  readonly kind: "multipart";
  readonly name: string;
}
export interface HttpMultipartAllMapping<
  Output = readonly (string | File)[],
> extends HttpMapping<Output> {
  readonly kind: "multipart-all";
  readonly name: string;
}
export interface HttpConstantMapping<
  Output extends JsonValue = JsonValue,
> extends HttpMapping<Output> {
  readonly kind: "constant";
  readonly value: Output;
}
export interface HttpNestedMapping<
  S extends HttpMappingShape = HttpMappingShape,
> extends HttpMapping<MappingShapeOutput<S>> {
  readonly kind: "nested";
  readonly fields: S;
}
export interface HttpInputMapping<
  S extends HttpMappingShape = HttpMappingShape,
> extends HttpMapping<MappingShapeOutput<S>> {
  readonly kind: "input";
  readonly fields: S;
}
export interface HttpOptionalMapping<
  M extends HttpMappingNode = HttpMappingNode,
> extends HttpMapping<HttpMappingOutput<M> | undefined> {
  readonly kind: "optional";
  readonly value: M;
}
export interface HttpDefaultMapping<
  M extends HttpMappingNode = HttpMappingNode,
  Default extends JsonValue = JsonValue,
> extends HttpMapping<Exclude<HttpMappingOutput<M>, undefined> | Default> {
  readonly kind: "default";
  readonly value: M;
  readonly default: Default;
}
export interface HttpTransformMapping<Output = unknown> extends HttpMapping<Output> {
  readonly kind: "transform";
  readonly transformId: string;
  readonly value: HttpMappingNode;
}
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
export type HttpRequestMapping = HttpInputMapping;
export interface HttpSourceOptions {
  readonly optional?: boolean;
  readonly default?: JsonValue;
}

export interface TransformReference<Id extends string = string> {
  readonly kind: "transform";
  readonly id: Id;
}
export interface HttpTransformRef<
  Id extends string = string,
  Schema extends StandardSchemaV1 = StandardSchemaV1,
> {
  readonly ref: TransformReference<Id>;
  readonly schema: Schema;
}
export interface HttpTransformDescriptor<
  Id extends string,
  Schema extends StandardSchemaV1,
> extends HttpTransformRef<Id, Schema> {
  readonly kind: "transform";
  readonly id: Id;
}
export type TransformOutput<T> = T extends { readonly schema: infer Schema }
  ? Schema extends StandardSchemaV1
    ? InferOutput<Schema>
    : unknown
  : unknown;
export interface DefineTransformOptions<
  Id extends string,
  Schema extends StandardSchemaV1,
> extends DescriptorMetadata {
  readonly id?: Id;
  readonly schema: Schema;
}

export interface HttpResponseMapping {
  readonly kind: "success" | "error" | "validation-error" | "response";
  readonly id: string;
  readonly status: number;
  readonly errorId?: string;
  readonly schema?: StandardSchemaV1;
}
export interface ContinueMapping {
  readonly kind: "continue";
}
export interface RespondMapping {
  readonly kind: "respond";
  readonly responseId: string;
  readonly body?: HttpMappingNode;
}
export type MiddlewareDecisionMapping = ContinueMapping | RespondMapping;

export interface HttpDsl {
  input<const S extends HttpMappingShape>(fields: S): HttpInputMapping<S>;
  nested<const S extends HttpMappingShape>(fields: S): HttpNestedMapping<S>;
  path(name: string): HttpPathMapping;
  path(name: string, options: HttpSourceOptions): HttpMappingNode;
  pathSegments(name: string): HttpPathSegmentsMapping;
  pathSegments(name: string, options: HttpSourceOptions): HttpMappingNode;
  query(name: string): HttpQueryMapping;
  query(name: string, options: HttpSourceOptions): HttpMappingNode;
  header(name: string): HttpHeaderMapping;
  header(name: string, options: HttpSourceOptions): HttpMappingNode;
  cookie(name: string): HttpCookieMapping;
  cookie(name: string, options: HttpSourceOptions): HttpMappingNode;
  body(): HttpWholeBodyMapping;
  body(name: string): HttpBodyMapping;
  body(name: string, options: HttpSourceOptions): HttpMappingNode;
  wholeBody(): HttpWholeBodyMapping;
  multipart(name: string): HttpMultipartMapping;
  multipart(name: string, options: HttpSourceOptions): HttpMappingNode;
  multipartAll(name: string): HttpMultipartAllMapping;
  multipartAll(name: string, options: HttpSourceOptions): HttpMappingNode;
  constant<const V extends JsonValue>(value: V): HttpConstantMapping<V>;
  optional<const M extends HttpMappingNode>(value: M): HttpOptionalMapping<M>;
  default<const M extends HttpMappingNode, const V extends JsonValue>(
    value: M,
    fallback: V,
  ): HttpDefaultMapping<M, V>;
  transform<const T extends HttpTransformRef | string, const M extends HttpMappingNode>(
    transform: T,
    value?: M,
  ): HttpTransformMapping<TransformOutput<T>>;
  success(status: number, schema?: StandardSchemaV1): HttpResponseMapping;
  error(errorId: string, status: number, schema?: StandardSchemaV1): HttpResponseMapping;
  validationError(status?: number, schema?: StandardSchemaV1): HttpResponseMapping;
  response(id: string, status: number, schema?: StandardSchemaV1): HttpResponseMapping;
  continue(): ContinueMapping;
  respond(response: HttpResponseMapping | string, body?: HttpMappingNode): RespondMapping;
}

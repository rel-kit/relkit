import type {
  HttpMappingNode,
  HttpPathMapping,
  HttpPathSegmentsMapping,
  HttpQueryMapping,
  HttpHeaderMapping,
  HttpCookieMapping,
  HttpBodyMapping,
  HttpWholeBodyMapping,
  HttpMultipartMapping,
  HttpMultipartAllMapping,
  HttpSourceOptions,
} from "./http-mapping.types.js";

/** Source constructors for serializable HTTP request mappings.
 * @example const id = http.path("id");
 */
export interface HttpDslSources {
  /** One path parameter.
   * @param name - Path parameter name
   * @returns A path source mapping.
   * @throws TypeError when the mapping input is invalid.
   * @example http.path("id");
   */
  path(name: string): HttpPathMapping;
  /** Maps a named path parameter with optionality or a default.
   * @param name - Source name.
   * @param options - Optionality or JSON fallback.
   * @returns A source mapping, optionally wrapped by a default or optional node.
   * @throws TypeError when the mapping input is invalid.
   * @example http.path("id", { optional: true });
   */
  path(name: string, options: HttpSourceOptions): HttpMappingNode;
  /** Captured path segments.
   * @param name - Segment parameter name
   * @returns A path segments mapping.
   * @throws TypeError when the mapping input is invalid.
   * @example http.pathSegments("parts");
   */
  pathSegments(name: string): HttpPathSegmentsMapping;
  /** Maps a captured path segments with optionality or a default.
   * @param name - Source name.
   * @param options - Optionality or JSON fallback.
   * @returns A source mapping, optionally wrapped by a default or optional node.
   * @throws TypeError when the mapping input is invalid.
   * @example http.pathSegments("parts", { optional: true });
   */
  pathSegments(name: string, options: HttpSourceOptions): HttpMappingNode;
  /** One query parameter.
   * @param name - Query parameter name
   * @returns A query source mapping.
   * @throws TypeError when the mapping input is invalid.
   * @example http.query("page");
   */
  query(name: string): HttpQueryMapping;
  /** Maps a named query parameter with optionality or a default.
   * @param name - Source name.
   * @param options - Optionality or JSON fallback.
   * @returns A source mapping, optionally wrapped by a default or optional node.
   * @throws TypeError when the mapping input is invalid.
   * @example http.query("page", { default: "1" });
   */
  query(name: string, options: HttpSourceOptions): HttpMappingNode;
  /** One request header.
   * @param name - Header name
   * @returns A header source mapping.
   * @throws TypeError when the mapping input is invalid.
   * @example http.header("authorization");
   */
  header(name: string): HttpHeaderMapping;
  /** Maps a named request header with optionality or a default.
   * @param name - Source name.
   * @param options - Optionality or JSON fallback.
   * @returns A source mapping, optionally wrapped by a default or optional node.
   * @throws TypeError when the mapping input is invalid.
   * @example http.header("authorization", { optional: true });
   */
  header(name: string, options: HttpSourceOptions): HttpMappingNode;
  /** One request cookie.
   * @param name - Cookie name
   * @returns A cookie source mapping.
   * @throws TypeError when the mapping input is invalid.
   * @example http.cookie("session");
   */
  cookie(name: string): HttpCookieMapping;
  /** Maps a named request cookie with optionality or a default.
   * @param name - Source name.
   * @param options - Optionality or JSON fallback.
   * @returns A source mapping, optionally wrapped by a default or optional node.
   * @throws TypeError when the mapping input is invalid.
   * @example http.cookie("session", { optional: true });
   */
  cookie(name: string, options: HttpSourceOptions): HttpMappingNode;
  /** The whole body or one body field.
   * @param name - Optional body field name
   * @param options - Optionality or fallback.
   * @returns A body source mapping.
   * @throws TypeError when the mapping input is invalid.
   * @example http.body("name");
   */
  /** The complete request body.
   * @returns A whole-body mapping.
   * @example http.body();
   */
  body(): HttpWholeBodyMapping;
  /** Maps one named body field.
   * @param name - Body field name.
   * @returns A body field mapping.
   * @throws TypeError when the mapping input is invalid.
   * @example http.body("name");
   */
  body(name: string): HttpBodyMapping;
  /** Maps a named body field with optionality or a default.
   * @param name - Source name.
   * @param options - Optionality or JSON fallback.
   * @returns A source mapping, optionally wrapped by a default or optional node.
   * @throws TypeError when the mapping input is invalid.
   * @example http.body("name", { optional: true });
   */
  body(name: string, options: HttpSourceOptions): HttpMappingNode;
  /** The complete request body.
   * @returns A whole-body mapping.
   * @example http.wholeBody();
   */
  wholeBody(): HttpWholeBodyMapping;
  /** One multipart form field.
   * @param name - Form field name
   * @returns A multipart source mapping.
   * @throws TypeError when the mapping input is invalid.
   * @example http.multipart("photo");
   */
  multipart(name: string): HttpMultipartMapping;
  /** Maps a named multipart field with optionality or a default.
   * @param name - Source name.
   * @param options - Optionality or JSON fallback.
   * @returns A source mapping, optionally wrapped by a default or optional node.
   * @throws TypeError when the mapping input is invalid.
   * @example http.multipart("photo", { optional: true });
   */
  multipart(name: string, options: HttpSourceOptions): HttpMappingNode;
  /** All values of one multipart field.
   * @param name - Form field name
   * @returns A multipart-array source mapping.
   * @throws TypeError when the mapping input is invalid.
   * @example http.multipartAll("files");
   */
  multipartAll(name: string): HttpMultipartAllMapping;
  /** Maps a all values of a multipart field with optionality or a default.
   * @param name - Source name.
   * @param options - Optionality or JSON fallback.
   * @returns A source mapping, optionally wrapped by a default or optional node.
   * @throws TypeError when the mapping input is invalid.
   * @example http.multipartAll("files", { optional: true });
   */
  multipartAll(name: string, options: HttpSourceOptions): HttpMappingNode;
}

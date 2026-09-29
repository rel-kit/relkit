/** A named HTTP route parameter parsed from a path segment.
 * @example const parameter: RouteParameter = { segment: ":id", name: "id", kind: "path", optional: false };
 */
export interface RouteParameter {
  readonly segment: string;
  readonly name: string;
  readonly kind: "path" | "path-segments";
  readonly optional: boolean;
}

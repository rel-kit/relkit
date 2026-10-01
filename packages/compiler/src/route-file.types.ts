/** Schema-derived static, dynamic, and catch-all route filename variants. */
export type RouteFileSegment = import("effect").Schema.Schema.Type<
  typeof import("./route-file.js").RouteFileSegmentSchema
>;

/** Canonical route path, runtime variants, parameter metadata, and precedence. */
export interface ParsedRouteFilePath {
  readonly sourcePath: string;
  readonly canonicalPath: string;
  readonly runtimePaths: readonly string[];
  readonly segments: readonly RouteFileSegment[];
  readonly parameters: readonly {
    readonly name: string;
    readonly kind: "dynamic" | "catch-all" | "optional-catch-all";
  }[];
  readonly precedence: 0 | 1 | 2 | 3;
}

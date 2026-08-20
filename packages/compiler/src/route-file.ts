export type RouteFileSegment =
  | { readonly kind: "static"; readonly value: string }
  | { readonly kind: "dynamic"; readonly name: string }
  | { readonly kind: "catch-all"; readonly name: string }
  | { readonly kind: "optional-catch-all"; readonly name: string };

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

/** Parses the required nested route-file convention without executing source. */
export function parseRouteFilePath(sourcePath: string): ParsedRouteFilePath {
  const normalized = sourcePath.replaceAll("\\", "/").replace(/^\.\/+/, "");
  const prefix = "src/routes/";
  if (!normalized.startsWith(prefix) || !normalized.endsWith("/route.ts")) {
    if (normalized !== "src/routes/route.ts") {
      throw new TypeError(`Route source must match ${prefix}**/route.ts: ${sourcePath}`);
    }
  }

  const relative = normalized.slice(prefix.length, -"route.ts".length).replace(/\/$/, "");
  const rawSegments = relative === "" ? [] : relative.split("/");
  const segments = rawSegments.map(parseSegment);
  assertSegments(segments);

  const canonicalPath = pathFrom(segments, "canonical");
  const optionalIndex = segments.findIndex((segment) => segment.kind === "optional-catch-all");
  const runtimePaths =
    optionalIndex === -1
      ? [pathFrom(segments, "runtime")]
      : [pathFrom(segments.slice(0, optionalIndex), "runtime"), pathFrom(segments, "runtime")];
  const parameters = segments.flatMap((segment) =>
    segment.kind === "static" ? [] : [{ name: segment.name, kind: segment.kind }],
  );
  const precedence = segments.reduce<0 | 1 | 2 | 3>(
    (rank, segment) => Math.max(rank, segmentRank(segment)) as 0 | 1 | 2 | 3,
    0,
  );

  return Object.freeze({
    sourcePath: normalized,
    canonicalPath,
    runtimePaths: Object.freeze(runtimePaths),
    segments: Object.freeze(segments),
    parameters: Object.freeze(parameters),
    precedence,
  });
}

/** Orders static, dynamic, required catch-all, then optional catch-all routes. */
export function compareRouteFilePaths(
  left: ParsedRouteFilePath,
  right: ParsedRouteFilePath,
): number {
  return (
    left.precedence - right.precedence || left.canonicalPath.localeCompare(right.canonicalPath)
  );
}

function parseSegment(value: string): RouteFileSegment {
  if (value === "" || value === "." || value === "..") invalid(value);
  if (value.startsWith("@") || value.includes("(") || value.includes(")")) {
    throw new TypeError(`Unsupported route segment "${value}"`);
  }
  const optional = /^\[\[\.\.\.([^\]]+)\]\]$/.exec(value);
  if (optional !== null) return named("optional-catch-all", optional[1] ?? "");
  const catchAll = /^\[\.\.\.([^\]]+)\]$/.exec(value);
  if (catchAll !== null) return named("catch-all", catchAll[1] ?? "");
  const dynamic = /^\[([^\]]+)\]$/.exec(value);
  if (dynamic !== null) return named("dynamic", dynamic[1] ?? "");
  if (value.includes("[") || value.includes("]")) invalid(value);
  return { kind: "static", value };
}

function named(
  kind: "dynamic" | "catch-all" | "optional-catch-all",
  name: string,
): RouteFileSegment {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new TypeError(`Invalid route parameter name "${name}"`);
  }
  return { kind, name };
}

function assertSegments(segments: readonly RouteFileSegment[]): void {
  const names = new Set<string>();
  segments.forEach((segment, index) => {
    if (segment.kind === "static") return;
    if (names.has(segment.name)) throw new TypeError(`Duplicate route parameter "${segment.name}"`);
    names.add(segment.name);
    if (segment.kind !== "dynamic" && index !== segments.length - 1) {
      throw new TypeError(`Catch-all route parameter "${segment.name}" must be the final segment`);
    }
  });
}

function pathFrom(segments: readonly RouteFileSegment[], mode: "canonical" | "runtime"): string {
  if (segments.length === 0) return "/";
  return `/${segments
    .map((segment) => {
      if (segment.kind === "static") return segment.value;
      if (segment.kind === "dynamic") return `:${segment.name}`;
      if (mode === "runtime") return `:${segment.name}{.+}`;
      return segment.kind === "catch-all" ? `*${segment.name}` : `*${segment.name}?`;
    })
    .join("/")}`;
}

function segmentRank(segment: RouteFileSegment): 0 | 1 | 2 | 3 {
  if (segment.kind === "static") return 0;
  if (segment.kind === "dynamic") return 1;
  return segment.kind === "catch-all" ? 2 : 3;
}

function invalid(value: string): never {
  throw new TypeError(`Malformed route segment "${value}"`);
}

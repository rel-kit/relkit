import {
  routePathSegmentToFileSegmentEffect,
  parseSegmentEffect,
  assertSegmentsEffect,
  pathFrom,
  segmentRank,
} from "./route-file-segments.js";
import { RouteFileError } from "./route-file-schema.js";
import { Effect } from "effect";
import { runCompilerSync } from "./compatibility.js";
import { observeCompiler } from "./observability.js";

import type { ParsedRouteFilePath } from "./route-file.types.js";
export type { RouteFileSegment, ParsedRouteFilePath } from "./route-file.types.js";

/**
 * Converts a canonical route path into its nested source-file convention.
 * @param routePath - Canonical HTTP route path.
 * @returns A lazy effect that converts a canonical route path into its nested source-file convention; unexpected access failures remain defects.
 * @see {@link normalizeCompilationEffect} for shared lazy composition and the execution boundary.
 */
export const routePathToFilePathEffect = Effect.fn("Compiler.routePathToFilePath")(
  function* (routePath: string) {
    if (routePath === "/") return "src/routes/route.ts";
    if (!routePath.startsWith("/") || routePath.endsWith("/")) {
      return yield* new RouteFileError({
        cause: new TypeError(
          `Route path must start with / and omit a trailing slash: ${routePath}`,
        ),
      });
    }

    const segments = yield* Effect.forEach(
      routePath.slice(1).split("/"),
      routePathSegmentToFileSegmentEffect,
    );
    const sourcePath = `src/routes/${segments.join("/")}/route.ts`;
    yield* parseRouteFilePathEffect(sourcePath);
    return sourcePath;
  },
  (effect) => observeCompiler("normalization", "routePathToFilePath", effect),
);

/**
 * Encodes a canonical HTTP path using the nested route filename convention.
 * @param routePath - Canonical HTTP route path.
 * @returns The conventional nested route filename under src/routes.
 */
export function routePathToFilePath(routePath: string): string {
  return runCompilerSync(
    routePathToFilePathEffect(routePath).pipe(Effect.mapError((error) => error.cause)),
  );
}

/**
 * Parses the required nested route-file convention without executing source.
 * @param sourcePath - Authored source filename.
 * @returns A lazy effect that parses the required nested route-file convention without executing source; unexpected access failures remain defects.
 * @remarks Unsupported syntax fails with RouteFileError; no services are required.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { parseRouteFilePathEffect } from "./route-file.js";
 * const route = Effect.runSync(parseRouteFilePathEffect("src/routes/[id]/route.ts"));
 * const invalid = Effect.runSync(Effect.flip(parseRouteFilePathEffect("src/flat.route.ts")));
 * ```
 */
export const parseRouteFilePathEffect = Effect.fn("Compiler.parseRouteFilePath")(
  function* (sourcePath: string) {
    const normalized = sourcePath.replaceAll("\\", "/").replace(/^\.\/+/, "");
    const prefix = "src/routes/";
    if (!normalized.startsWith(prefix) || !normalized.endsWith("/route.ts")) {
      if (normalized !== "src/routes/route.ts") {
        return yield* new RouteFileError({
          cause: new TypeError(`Route source must match ${prefix}**/route.ts: ${sourcePath}`),
        });
      }
    }

    const relative = normalized.slice(prefix.length, -"route.ts".length).replace(/\/$/, "");
    const rawSegments = relative === "" ? [] : relative.split("/");
    const segments = yield* Effect.forEach(rawSegments, parseSegmentEffect);
    yield* assertSegmentsEffect(segments);

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
  },
  (effect) => observeCompiler("normalization", "parseRouteFilePath", effect),
);

/**
 * Parses a conventional route filename into canonical and runtime path variants.
 * @param sourcePath - Authored source filename.
 * @returns Canonical and runtime paths, named parameters, and precedence for the source file.
 */
export function parseRouteFilePath(sourcePath: string): ParsedRouteFilePath {
  return runCompilerSync(
    parseRouteFilePathEffect(sourcePath).pipe(Effect.mapError((error) => error.cause)),
  );
}

/**
 * Orders static, dynamic, required catch-all, then optional catch-all routes.
 * @param left - First value to compare.
 * @param right - Second value to compare.
 * @returns The ordering result or precedence rank.
 */
export function compareRouteFilePaths(
  left: ParsedRouteFilePath,
  right: ParsedRouteFilePath,
): number {
  return (
    left.precedence - right.precedence || left.canonicalPath.localeCompare(right.canonicalPath)
  );
}

export { RouteFileError, RouteFileSegmentSchema } from "./route-file-schema.js";

import { Effect } from "effect";
import { runCompilerSync } from "./compatibility.js";
import { observeCompiler } from "./observability.js";
import type {
  MiddlewareRouteMatch,
  MiddlewareRouteReference,
} from "./middleware-coverage.types.js";
export type {
  MiddlewareRouteMatch,
  MiddlewareRouteReference,
} from "./middleware-coverage.types.js";
import type { NormalizedDescriptor, NormalizationWork } from "./normalize-types.js";
import { isRecord } from "./normalize-utils.js";

/**
 * Checks supported middleware path and terminal wildcard syntax.
 * @param value - Declared metadata inspected without coercion.
 * @returns True when the source filename follows the middleware convention.
 */
export function isMiddlewarePath(value: unknown): value is string {
  if (value === "*") return true;
  if (typeof value !== "string" || !value.startsWith("/")) return false;
  if (value === "/") return true;
  const parts = value.slice(1).split("/");
  return parts.every((part, index) => {
    if (part === "*") return index === parts.length - 1;
    return part !== "" && (/^:[A-Za-z_][A-Za-z0-9_]*$/.test(part) || !/[*:?{}]/.test(part));
  });
}

/**
 * Selects middleware whose paths cover or overlap a route.
 * @param route - Route whose coverage is selected.
 * @param work - Invocation-owned descriptors, indexes, and diagnostics.
 * @returns A lazy effect yielding the checked result; findings append to the workspace diagnostics.
 * @remarks Unexpected metadata access failures remain defects.
 * @see {@link normalizeCompilationEffect} for ordered stage composition.
 */
export const middlewareForRouteEffect = Effect.fn("Compiler.middlewareForRoute")(
  function* (route: NormalizedDescriptor, work: NormalizationWork) {
    const routeValue = isRecord(route.value) ? route.value : {};
    const paths = runtimePaths(routeValue);
    return [...work.middlewareReferences.values()]
      .sort((left, right) => left.id.localeCompare(right.id))
      .flatMap((middleware, order) => {
        const value = isRecord(middleware.value) ? middleware.value : {};
        if (typeof value.path !== "string") return [];
        const matches = paths.map((path) => pathRelation(value.path, path));
        if (matches.every((match) => match === undefined)) return [];
        return [
          {
            id: middleware.id,
            path: value.path,
            order,
            match: matches.every((match) => match === "always")
              ? ("always" as const)
              : ("conditional" as const),
          },
        ];
      });
  },
  (effect, route, work) =>
    observeCompiler("normalization", "middlewareForRoute", effect, () => ({
      descriptors: work.descriptors.length,
      diagnostics: work.diagnostics.length,
    })),
);

/**
 * Selects middleware whose paths cover or overlap a route.
 * @param route - Route whose coverage is selected.
 * @param work - Invocation-owned descriptors, indexes, and diagnostics.
 * @returns The checked result after executing the Effect at the compatibility boundary.
 * @remarks Unexpected metadata access failures remain defects.
 * @see {@link normalizeCompilationEffect} for ordered stage composition.
 */
export function middlewareForRoute(
  route: NormalizedDescriptor,
  work: NormalizationWork,
): readonly MiddlewareRouteReference[] {
  return runCompilerSync(middlewareForRouteEffect(route, work));
}

/**
 * Classifies whether middleware always or conditionally covers a route.
 * @param middlewarePath - Normalized middleware source path used for route coverage.
 * @param routePath - Canonical HTTP route path.
 * @returns The middleware's route coverage classification, or undefined for no coverage.
 */
export function pathRelation(
  middlewarePath: string,
  routePath: string,
): MiddlewareRouteMatch | undefined {
  if (middlewarePath === "*") return "always";
  const middleware = segments(middlewarePath);
  const route = segments(routePath);
  const middlewareWildcard = middleware.at(-1) === "*";
  const middlewarePrefix = middlewareWildcard ? middleware.slice(0, -1) : middleware;
  const routeWildcard = route.findIndex(isRouteWildcard);
  const fixedRoute = routeWildcard < 0;

  const shared = Math.min(middlewarePrefix.length, fixedRoute ? route.length : routeWildcard);
  for (let index = 0; index < shared; index += 1) {
    if (!overlaps(middlewarePrefix[index] ?? "", route[index] ?? "")) return undefined;
  }

  if (fixedRoute) {
    if (!middlewareWildcard && middlewarePrefix.length !== route.length) return undefined;
    if (middlewareWildcard && route.length < middlewarePrefix.length) return undefined;
    return middlewarePrefix.every(
      (segment, index) => index >= route.length || covers(segment, route[index] ?? ""),
    )
      ? "always"
      : "conditional";
  }

  if (middlewarePrefix.length < routeWildcard && !middlewareWildcard) return undefined;
  if (middlewareWildcard && middlewarePrefix.length <= routeWildcard) {
    return middlewarePrefix.every((segment, index) => covers(segment, route[index] ?? ""))
      ? "always"
      : "conditional";
  }
  return "conditional";
}

/**
 * Selects normalized runtime variants from route metadata.
 * @param value - Declared metadata inspected without coercion.
 * @returns Declared runtime path variants, falling back to the canonical route.
 */
function runtimePaths(value: Record<string, unknown>): readonly string[] {
  if (Array.isArray(value.runtimePaths)) {
    const paths = value.runtimePaths.filter((entry): entry is string => typeof entry === "string");
    if (paths.length > 0) return paths;
  }
  return [typeof value.path === "string" ? value.path : ""];
}

/**
 * Splits a primitive path into nonempty segments.
 * @param path - Portable source, property, or runtime path.
 * @returns Nonempty primitive path segments in order.
 */
function segments(path: string): readonly string[] {
  return path === "/" ? [] : path.replace(/^\//, "").split("/");
}

/**
 * Checks whether two path segments may match the same request segment.
 * @param middleware - Middleware descriptor or path being compared.
 * @param route - Route descriptor being checked or projected.
 * @returns True when the middleware and route path sets can intersect.
 */
function overlaps(middleware: string, route: string): boolean {
  return middleware.startsWith(":") || route.startsWith(":") || middleware === route;
}

/**
 * Checks whether a middleware segment covers a route segment.
 * @param middleware - Middleware descriptor or path being compared.
 * @param route - Route descriptor being checked or projected.
 * @returns True when the middleware applies to every route path match.
 */
function covers(middleware: string, route: string): boolean {
  return middleware.startsWith(":") || (!route.startsWith(":") && middleware === route);
}

/**
 * Recognizes a runtime route catch-all segment.
 * @param segment - Parsed route segment whose precedence is inspected.
 * @returns True when the runtime path segment represents a catch-all.
 */
function isRouteWildcard(segment: string): boolean {
  return segment.startsWith("*") || /^:[^{]+\{\.\+\}$/.test(segment);
}

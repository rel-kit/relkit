import type { NormalizedDescriptor, NormalizationWork } from "./normalize-types.js";
import { isRecord } from "./normalize-utils.js";

export type MiddlewareRouteMatch = "always" | "conditional";

export interface MiddlewareRouteReference {
  readonly id: string;
  readonly path: string;
  readonly order: number;
  readonly match: MiddlewareRouteMatch;
}

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

export function middlewareForRoute(
  route: NormalizedDescriptor,
  work: NormalizationWork,
): readonly MiddlewareRouteReference[] {
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
          match: matches.every((match) => match === "always") ? "always" : "conditional",
        },
      ];
    });
}

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

function runtimePaths(value: Record<string, unknown>): readonly string[] {
  if (Array.isArray(value.runtimePaths)) {
    const paths = value.runtimePaths.filter((entry): entry is string => typeof entry === "string");
    if (paths.length > 0) return paths;
  }
  return [typeof value.path === "string" ? value.path : ""];
}

function segments(path: string): readonly string[] {
  return path === "/" ? [] : path.replace(/^\//, "").split("/");
}

function overlaps(middleware: string, route: string): boolean {
  return middleware.startsWith(":") || route.startsWith(":") || middleware === route;
}

function covers(middleware: string, route: string): boolean {
  return middleware.startsWith(":") || (!route.startsWith(":") && middleware === route);
}

function isRouteWildcard(segment: string): boolean {
  return segment.startsWith("*") || /^:[^{]+\{\.\+\}$/.test(segment);
}

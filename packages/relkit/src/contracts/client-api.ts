import type { ClientApiRouteSource } from "./client-api.types.js";
export type { ClientApiRouteSource } from "./client-api.types.js";

/** Router key under which the RPC transport mounts the typed client's API tree. */
export const CLIENT_API_ROOT = "api";

const methodRank = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

/**
 * Names each public route's property in the generated `api` object.
 *
 * The path is the target function ID with every segment in camelCase, so the first
 * segment is the service: `orders.price-order` becomes `api.orders.priceOrder`. When
 * several routes target one function, the first by method and then path keeps that
 * name; the others add their method (`getOrderHead`), or their static path segments
 * when the method repeats (`searchOrdersSearch`), and a number as the last resort.
 * The compiler and the RPC transport both call this, so they always agree.
 * @param routes - Public client routes with their trigger and target IDs.
 * @returns Each trigger ID mapped to its API path.
 * @example clientApiPaths([{ id: "route.get.orders", method: "GET", path: "/orders", targetFunctionId: "orders.search-orders" }]);
 */
export function clientApiPaths(
  routes: readonly ClientApiRouteSource[],
): ReadonlyMap<string, readonly string[]> {
  const byTarget = new Map<string, ClientApiRouteSource[]>();
  for (const route of routes) {
    const group = byTarget.get(route.targetFunctionId) ?? [];
    group.push(route);
    byTarget.set(route.targetFunctionId, group);
  }
  const taken = new Set<string>();
  const result = new Map<string, readonly string[]>();
  for (const target of [...byTarget.keys()].sort()) {
    const segments = target.split(".").map(camelCase);
    const parent = segments.slice(0, -1);
    const base = segments.at(-1) ?? "route";
    const methods = new Set<string>();
    for (const route of byTarget.get(target)!.sort(compareRoutes)) {
      const method = pascalCase(route.method.toLowerCase());
      const candidates =
        methods.size === 0
          ? [base]
          : methods.has(method)
            ? [`${base}${staticSuffix(route.path, parent[0])}`]
            : [`${base}${method}`];
      methods.add(method);
      let name = candidates.find((value) => !taken.has([...parent, value].join(".")));
      for (let index = 2; name === undefined; index += 1) {
        const value = `${candidates[0]}${index}`;
        if (!taken.has([...parent, value].join("."))) name = value;
      }
      taken.add([...parent, name].join("."));
      result.set(route.id, [...parent, name]);
    }
  }
  return result;
}

/**
 * Orders routes that share a target by method rank, then path length and text.
 * @param left - First route.
 * @param right - Second route.
 * @returns A negative, zero or positive sort value.
 */
function compareRoutes(left: ClientApiRouteSource, right: ClientApiRouteSource): number {
  const rank = (method: string) => {
    const index = methodRank.indexOf(method.toUpperCase());
    return index === -1 ? methodRank.length : index;
  };
  return (
    rank(left.method) - rank(right.method) ||
    left.path.length - right.path.length ||
    left.path.localeCompare(right.path) ||
    left.id.localeCompare(right.id)
  );
}

/**
 * Builds a PascalCase suffix from a path's static segments, minus a leading service name.
 * @param path - Route path such as `/orders/search`.
 * @param service - The service segment to drop when it leads the path.
 * @returns The suffix, or `Route` when the path has no other static segment.
 */
function staticSuffix(path: string, service: string | undefined): string {
  const segments = path
    .split("/")
    .filter((segment) => segment !== "" && !segment.startsWith(":") && !segment.startsWith("*"))
    .map(camelCase);
  const named = segments[0] === service ? segments.slice(1) : segments;
  return named.length === 0 ? "Route" : named.map(pascalCase).join("");
}

/**
 * Converts a kebab, snake or spaced identifier to camelCase.
 * @param value - Identifier segment.
 * @returns The camelCase form.
 */
function camelCase(value: string): string {
  const words = value.split(/[^A-Za-z0-9]+/).filter((word) => word !== "");
  if (words.length === 0) return "route";
  const [first, ...rest] = words;
  return `${first!.charAt(0).toLowerCase()}${first!.slice(1)}${rest.map(pascalCase).join("")}`;
}

/**
 * Upper-cases the first character of a word.
 * @param value - Word to convert.
 * @returns The word with an upper-case first character.
 */
function pascalCase(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

/**
 * Development-only stream on the backend's public port that tells frontends when the
 * backend's client contract may have changed, so they reload it without a restart.
 */
export const CLIENT_CONTRACT_EVENTS_PATH = "/_relkit/v1/client/contract-events";

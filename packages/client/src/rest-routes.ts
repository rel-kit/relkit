/** Loads and caches the backend's client routes document. */
import type { ClientRouteEntry, RouteTable } from "./rest-routes.types.js";
import { API_ROOT_KEY, CLIENT_ROUTES_PATH } from "./wire.js";
export type { ClientRouteEntry, RouteTable } from "./rest-routes.types.js";

/** Minimum time between two reloads caused by a route the cached table lacks. */
const RELOAD_AFTER_MS = 1_000;

/**
 * Creates a lazily loaded route table. It loads on the first call, and reloads when a call
 * names a route it lacks, so a route the backend adds during development works at once.
 * @param baseUrl - Backend root URL.
 * @param load - Fetches the document; receives the absolute document URL.
 * @returns The route table.
 * @example const table = createRouteTable("http://127.0.0.1:3000", (url, signal) => fetch(url, { signal }));
 */
export function createRouteTable(
  baseUrl: string,
  load: (url: URL, signal?: AbortSignal) => Promise<Response>,
): RouteTable {
  let current: Promise<Map<string, ClientRouteEntry>> | undefined;
  let loadedAt = 0;
  const reload = (signal?: AbortSignal) => {
    loadedAt = Date.now();
    const next = fetchRoutes(baseUrl, load, signal);
    current = next;
    next.catch(() => {
      if (current === next) current = undefined;
    });
    return next;
  };
  return {
    async find(path, signal) {
      const key = routeKey(path);
      const routes = await (current ?? reload(signal));
      const found = routes.get(key);
      if (found !== undefined || Date.now() - loadedAt < RELOAD_AFTER_MS) return found;
      return (await reload(signal)).get(key);
    },
  };
}

/**
 * Fetches the document and indexes it by every name a call can use.
 * @param baseUrl - Backend root URL.
 * @param load - Fetch function.
 * @param signal - Cancels the request.
 * @returns Routes by `api.<path>`, selector and ID.
 */
async function fetchRoutes(
  baseUrl: string,
  load: (url: URL, signal?: AbortSignal) => Promise<Response>,
  signal?: AbortSignal,
): Promise<Map<string, ClientRouteEntry>> {
  const base = new URL(baseUrl);
  const root = base.pathname.endsWith("/") ? base : new URL(`${base.pathname}/`, base);
  const response = await load(new URL(CLIENT_ROUTES_PATH.slice(1), root), signal);
  if (!response.ok) throw new Error(`RelKit client routes request failed (${response.status})`);
  const document = (await response.json()) as { readonly routes?: readonly ClientRouteEntry[] };
  const routes = new Map<string, ClientRouteEntry>();
  for (const route of document.routes ?? []) {
    routes.set(routeKey([API_ROOT_KEY, ...route.api]), route);
    routes.set(`${route.method} ${route.path}`, route);
    if (!routes.has(route.id)) routes.set(route.id, route);
  }
  return routes;
}

/**
 * Turns a call path into a lookup key.
 * @param path - Call path.
 * @returns `api.orders.getOrder` for API paths, otherwise the single name.
 */
function routeKey(path: readonly string[]): string {
  return path[0] === API_ROOT_KEY ? path.join(".") : (path[0] ?? "");
}

/**
 * Answers requests that no route matched with the same JSON error shape as other framework
 * failures, and with 405 plus `Allow` when the path exists under other methods.
 */
import type { Context, Hono } from "hono";
import { TrieRouter } from "hono/router/trie-router";

/** Installs the unmatched-route response on the application shell.
 * @param app - Shell whose routes are registered before or after this call.
 * @returns Nothing; the route table is read when the first unmatched request arrives.
 */
export function installUnmatchedRoute(app: Hono): void {
  let table: RouteTable | undefined;
  app.notFound((context: Context) => {
    // Routes are materialized after the shell, so the table is built from the final registry.
    if (table === undefined || table.size !== app.routes.length) table = routeTable(app);
    const allowed = table.allowed(context.req.path, context.req.method);
    if (allowed.length > 0)
      return context.json({ error: "method-not-allowed" }, 405, { allow: allowed.join(", ") });
    return context.json({ error: "not-found" }, 404);
  });
}

interface RouteTable {
  readonly size: number;
  readonly allowed: (path: string, method: string) => readonly string[];
}

/** Indexes method-specific routes; `ALL` entries and `*` patterns are middleware or catch-alls
 * (such as static files) that say nothing about which methods a concrete path supports.
 * @param app - Application whose registered routes are indexed.
 * @returns Lookup of the methods registered for a concrete path.
 */
function routeTable(app: Hono): RouteTable {
  const router = new TrieRouter<true>();
  const methods = new Set<string>();
  for (const route of app.routes) {
    if (route.method === "ALL" || route.path === "*" || route.path === "/*") continue;
    router.add(route.method, route.path, true);
    methods.add(route.method);
  }
  if (methods.has("GET")) methods.add("HEAD");
  return {
    size: app.routes.length,
    allowed: (path, method) => {
      // HEAD is served by GET routes, so neither is an alternative to the other.
      const requested = method === "HEAD" ? "GET" : method;
      const supported = [...methods].filter(
        (candidate) => router.match(candidate === "HEAD" ? "GET" : candidate, path)[0].length > 0,
      );
      return supported.some((candidate) => candidate === requested) ? [] : supported;
    },
  };
}

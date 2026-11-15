import type { InspectorQuery } from "./api-query-types";

/** How many recent logs, traces or requests a function or route page lists. */
export const RECENT_LIMIT = 10;

/**
 * The query for the recent records of one function or route. History is oldest first unless the
 * query says otherwise, so a page that lists "recent" records asks for the newest explicitly.
 */
export function recentQuery(
  scope: { readonly functionId: string } | { readonly routeId: string },
): InspectorQuery {
  return { ...scope, limit: RECENT_LIMIT, order: "desc" };
}

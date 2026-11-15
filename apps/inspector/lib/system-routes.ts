import type { InspectorObject } from "./api-types";

/** A route the framework handles itself: the authentication mount, the health probe, the RPC endpoint. */
export interface SystemRoute {
  readonly id: string;
  /** The method, or ANY for a route that answers every method. */
  readonly method: string;
  /** The path; a prefix route ends with `/*`. */
  readonly path: string;
  readonly description: string;
  /** The route answers every path under its path, so it cannot be sent as one request. */
  readonly prefix: boolean;
}

/** How many entries close the routes collection: at most three system routes follow the declared ones. */
export const SYSTEM_ROUTE_TAIL = 5;

/** "ANY" for the wildcard method, the method as declared otherwise. */
export function methodLabel(method: unknown): string {
  if (method === "*") return "ANY";
  return typeof method === "string" && method !== "" ? method : "HTTP";
}

/** The system routes among routes-collection entries, in the order the API lists them. */
export function systemRoutes(items: readonly InspectorObject[]): readonly SystemRoute[] {
  return items.flatMap((item) => {
    if (item.system !== true || typeof item.id !== "string") return [];
    const config = item.config as { method?: unknown; path?: unknown } | undefined;
    const path = typeof config?.path === "string" ? config.path : "";
    return [
      {
        id: item.id,
        method: methodLabel(config?.method),
        path,
        description: typeof item.description === "string" ? item.description : "",
        prefix: path.endsWith("/*"),
      },
    ];
  });
}

/** The cursor of the last page entries of a collection of `total` records. */
export function tailCursor(total: number): string {
  return String(Math.max(0, total - SYSTEM_ROUTE_TAIL));
}

/**
 * The declared routes of a page of the routes collection. System routes follow the declared ones
 * in the collection, so they are removed from the page and from the total, and a continuation
 * that would lead only to them is dropped.
 * @param page - A page of the routes collection.
 * @param offset - Index of the page's first entry, from its cursor.
 * @param systemCount - How many system routes the collection holds for the same filters.
 */
export function declaredRoutesPage<
  P extends {
    readonly items: readonly InspectorObject[];
    readonly nextCursor?: string | undefined;
    readonly total?: number | undefined;
  },
>(
  page: P,
  offset: number,
  systemCount: number,
): Omit<P, "items" | "total" | "nextCursor"> & {
  readonly items: readonly InspectorObject[];
  readonly total?: number;
  readonly nextCursor?: string;
} {
  const { items: all, total, nextCursor, ...rest } = page;
  const items = all.filter((item) => item.system !== true);
  const declaredTotal = total === undefined ? undefined : Math.max(0, total - systemCount);
  const more =
    nextCursor !== undefined &&
    (declaredTotal === undefined || offset + items.length < declaredTotal);
  return {
    ...rest,
    items,
    ...(declaredTotal === undefined ? {} : { total: declaredTotal }),
    ...(more ? { nextCursor } : {}),
  };
}

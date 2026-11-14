import { EMPTY_SIGNAL_FILTERS, type SignalFilters } from "./observability-model";
import { REQUEST_OUTCOME_OPTIONS } from "./request-filters";
import { localDateTime } from "./signal-defaults";

/** What the requests page keeps in its URL: filters, page size and the cursor of the page. */
export interface RequestsLocation {
  readonly filters: SignalFilters;
  readonly limit: number;
  /** Cursor of the page being viewed; absent on the first page. */
  readonly cursor?: string;
}

export const PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 50;

/** Filters that are copied to the URL as they are, under the API's parameter names. */
const TEXT_PARAMETERS = [
  "status",
  "method",
  "path",
  "search",
  "errorId",
  "routeId",
  "functionId",
  "requestId",
  "traceId",
  "serviceId",
] as const satisfies readonly (keyof SignalFilters)[];

/** Reads the requests page state from a query string; unusable values fall back to defaults. */
export function parseRequestsLocation(params: URLSearchParams): RequestsLocation {
  const text: Partial<Record<keyof SignalFilters, string>> = {};
  for (const name of TEXT_PARAMETERS) text[name] = params.get(name) ?? "";
  const outcome = params.get("outcome") ?? "";
  const limit = Number(params.get("limit"));
  const cursor = params.get("cursor") ?? "";
  return {
    filters: {
      ...EMPTY_SIGNAL_FILTERS,
      ...text,
      outcome: REQUEST_OUTCOME_OPTIONS.some((option) => option.value === outcome) ? outcome : "",
      from: localInput(params.get("from")),
      to: localInput(params.get("to")),
    },
    limit: (PAGE_SIZES as readonly number[]).includes(limit) ? limit : DEFAULT_PAGE_SIZE,
    ...(cursor === "" ? {} : { cursor }),
  };
}

/** The query string (without `?`) for a state; the default view gives an empty string. */
export function requestsSearch(state: RequestsLocation): string {
  const params = new URLSearchParams();
  for (const name of TEXT_PARAMETERS) {
    const value = state.filters[name];
    if (value !== "") params.set(name, value);
  }
  if (state.filters.outcome !== "") params.set("outcome", state.filters.outcome);
  // The URL carries instants, so a shared link means the same range in every time zone.
  for (const name of ["from", "to"] as const) {
    const instant = new Date(state.filters[name]);
    if (state.filters[name] !== "" && Number.isFinite(instant.getTime()))
      params.set(name, instant.toISOString());
  }
  if (state.limit !== DEFAULT_PAGE_SIZE) params.set("limit", String(state.limit));
  if (state.cursor !== undefined) params.set("cursor", state.cursor);
  return params.toString();
}

/** The cursors of the pages visited under one set of filters, oldest visit first. */
export interface PageTrail {
  readonly key: string;
  /** `undefined` is the first page. */
  readonly cursors: readonly (string | undefined)[];
}

/**
 * Updates the trail for the page now shown. Going back to a page already in the trail cuts the
 * trail there; a new filter set starts over. A page reached by a shared link has the first page
 * behind it.
 */
export function trailAfter(
  trail: PageTrail | undefined,
  key: string,
  cursor: string | undefined,
): PageTrail {
  if (cursor === undefined) return { key, cursors: [undefined] };
  const known = trail?.key === key ? trail.cursors : [undefined];
  const index = known.indexOf(cursor);
  return { key, cursors: index < 0 ? [...known, cursor] : known.slice(0, index + 1) };
}

/** The cursor of the page that comes before the current one; `undefined` means the first page. */
export function newerCursor(trail: PageTrail): string | undefined {
  return trail.cursors.at(-2);
}

function localInput(value: string | null): string {
  const instant = value === null ? Number.NaN : Date.parse(value);
  return Number.isFinite(instant) ? localDateTime(instant) : "";
}

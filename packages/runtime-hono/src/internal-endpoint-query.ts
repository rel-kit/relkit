import type { JsonValue } from "@relkit/contracts";
import type { InternalPage, InternalQuery } from "./internal-endpoints.js";

/** Invalid inspector pagination or time-filter input. */
export class InternalQueryError extends TypeError {
  /** Create the stable public invalid-query error. */
  constructor() {
    super("Invalid internal endpoint query.");
    this.name = "InternalQueryError";
  }
}

/** Recognize the internal endpoint's public invalid-query error.
 * @param value - Value to validate or project.
 * @returns Whether the value is an InternalQueryError.
 */
export function isInvalidQueryError(value: unknown): value is InternalQueryError {
  return value instanceof InternalQueryError;
}

/** Filter inspector rows by fields and time range before pagination.
 * @param page - Provider page to validate or project.
 * @param query - Validated inspector query.
 * @returns The sliced page with a local or provider continuation cursor.
 */
export function queryPage(page: InternalPage, query: InternalQuery): InternalPage {
  const from = query.from === undefined ? undefined : Date.parse(query.from);
  const to = query.to === undefined ? undefined : Date.parse(query.to);
  if ((from !== undefined && !Number.isFinite(from)) || (to !== undefined && !Number.isFinite(to)))
    throw new InternalQueryError();
  if (from !== undefined && to !== undefined && from > to) throw new InternalQueryError();
  const filtered = page.items.filter((item) => matchesQuery(item, query, from, to));
  const start = page.nextCursor === undefined ? cursorOffset(query.cursor) : 0;
  const items = filtered.slice(start, start + query.limit);
  const next = start + items.length < filtered.length ? String(start + items.length) : undefined;
  const nextCursor = next ?? page.nextCursor;
  return { items, ...(nextCursor === undefined ? {} : { nextCursor }) };
}

/** Apply exact field, severity, request and inclusive time filters.
 * @param item - Candidate JSON row.
 * @param query - Validated inspector query.
 * @param from - Inclusive lower timestamp bound.
 * @param to - Inclusive upper timestamp bound.
 * @returns Whether the row satisfies every requested filter.
 */
function matchesQuery(item: JsonValue, query: InternalQuery, from?: number, to?: number): boolean {
  if (!isRecord(item))
    return Object.keys(query).every((key) => key === "limit" || key === "cursor");
  const timestamp = [item.timestamp, item.startedAt, item.occurredAt, item.completedAt].find(
    (value) => typeof value === "string",
  );
  const time = typeof timestamp === "string" ? Date.parse(timestamp) : Number.NaN;
  return (
    exact(item, query.routeId, "routeId") &&
    exact(item, query.functionId, "functionId") &&
    exact(item, query.outcome, "outcome") &&
    exact(item, query.traceId, "traceId") &&
    (query.requestId === undefined ||
      item.requestId === query.requestId ||
      item.correlationId === query.requestId) &&
    (query.severity === undefined ||
      item.level === query.severity ||
      item.severity === query.severity) &&
    (from === undefined || (Number.isFinite(time) && time >= from)) &&
    (to === undefined || (Number.isFinite(time) && time <= to))
  );
}

/** Apply an optional exact-match constraint to a JSON field.
 * @param item - Candidate JSON row.
 * @param value - Value to validate or project.
 * @param key - Property or profile key to inspect.
 * @returns True when no constraint is set or the field equals it.
 */
function exact(item: Record<string, JsonValue>, value: string | undefined, key: string): boolean {
  return value === undefined || item[key] === value;
}

/** Parse a nonnegative integer offset for local inspector pagination.
 * @param value - Value to validate or project.
 * @returns The offset, defaulting to zero; invalid values throw.
 */
function cursorOffset(value: string | undefined): number {
  if (value === undefined) return 0;
  const offset = Number(value);
  if (!Number.isSafeInteger(offset) || offset < 0) throw new InternalQueryError();
  return offset;
}

/** Check whether a JSON value contains named fields.
 * @param value - JSON value inspected by query matching.
 * @returns Whether the value is a non-array object.
 */
function isRecord(value: JsonValue): value is Record<string, JsonValue> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

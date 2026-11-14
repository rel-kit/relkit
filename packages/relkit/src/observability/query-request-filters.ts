/**
 * Request-attribute filters of history queries: `status` (exact `500` or class `5xx`), `method`,
 * `path` (prefix of the raw request path), `errorId` (declared error identifier) and the opt-in
 * `count`. The in-memory query applies `matchesRequestFilters` to each candidate record and the
 * Inspector's DuckDB store compiles the same rules to SQL with `statusRange` and
 * `normalizedMethod`, so both stores give one answer. Status, method and path select request
 * records only; `errorId` also matches spans and invocations carrying `relkit.error.id`.
 */
import { ObservabilityQueryError, type ObservabilityQueryRequest } from "./query-types.js";
import type { ObservabilityRecord } from "./model.js";

/** URL parameters of the request filters, in the order the inspection API reads them. */
export const OBSERVABILITY_REQUEST_FILTER_PARAMETERS = Object.freeze([
  "status",
  "method",
  "path",
  "errorId",
  "count",
] as const);

/**
 * Parses a status filter into the inclusive range of matching status codes.
 * @param status - Exact code such as `404`, or class such as `4xx`.
 * @returns The inclusive `[min, max]` range, or undefined when the filter is malformed.
 */
export function statusRange(
  status: string | number,
): readonly [number, number] | undefined {
  const text = String(status).trim().toLowerCase();
  const exact = /^([1-5])\d\d$/.exec(text);
  if (exact !== null) return [Number(text), Number(text)];
  const family = /^([1-5])xx$/.exec(text);
  if (family === null) return undefined;
  const base = Number(family[1]) * 100;
  return [base, base + 99];
}

/**
 * Normalizes a method filter for comparison with recorded methods.
 * @param method - Method filter in any case.
 * @returns The upper-case method.
 */
export function normalizedMethod(method: string): string {
  return method.trim().toUpperCase();
}

/**
 * Reads the opt-in total flag of a query, as a boolean or a URL parameter.
 * @param query - Query request.
 * @returns Whether the page must carry `total`.
 */
export function countRequested(query: Pick<ObservabilityQueryRequest, "count">): boolean {
  return query.count === true || query.count === "true";
}

/**
 * Rejects malformed request filters with the query's existing invalid-query error.
 * @param value - Query request.
 * @returns Nothing when every present request filter is well formed.
 * @throws {ObservabilityQueryError} `RELKIT_OBSERVABILITY_QUERY_INVALID` naming the filter.
 */
export function validateRequestFilters(value: ObservabilityQueryRequest): void {
  if (value.status !== undefined && statusRange(value.status) === undefined)
    invalid("status", "an HTTP status from 100 to 599 or a class from 1xx to 5xx");
  if (value.method !== undefined && !/^[A-Za-z]{1,16}$/.test(String(value.method)))
    invalid("method", "an HTTP method of 1 to 16 letters");
  if (
    value.path !== undefined &&
    (typeof value.path !== "string" ||
      !value.path.startsWith("/") ||
      value.path.length > 512 ||
      /[\u0000-\u001f]/.test(value.path))
  )
    invalid("path", "a path prefix starting with / of at most 512 characters");
  if (
    value.errorId !== undefined &&
    (typeof value.errorId !== "string" || value.errorId.length === 0 || value.errorId.length > 256)
  )
    invalid("errorId", "a declared error identifier of 1 to 256 characters");
  if (value.count !== undefined && ![true, false, "true", "false"].includes(value.count))
    invalid("count", "true or false");
}

/**
 * Tests a record against the request filters of a validated query.
 * @param record - Candidate record.
 * @param query - Validated query.
 * @returns True when every present request filter matches the record.
 */
export function matchesRequestFilters(
  record: ObservabilityRecord,
  query: ObservabilityQueryRequest,
): boolean {
  if (query.errorId !== undefined && recordErrorId(record) !== query.errorId) return false;
  if (query.status === undefined && query.method === undefined && query.path === undefined)
    return true;
  if (record.signal !== "request") return false;
  const range = query.status === undefined ? undefined : statusRange(query.status);
  if (range !== undefined && !(record.status !== undefined && record.status >= range[0] && record.status <= range[1]))
    return false;
  if (query.method !== undefined && record.method.toUpperCase() !== normalizedMethod(query.method))
    return false;
  return query.path === undefined || record.rawPath.startsWith(query.path);
}

/**
 * Reads the declared error identifier a record carries.
 * @param record - Candidate record.
 * @returns `errorId` of request and invocation records, or the `relkit.error.id` span attribute.
 */
function recordErrorId(record: ObservabilityRecord): string | undefined {
  if ("errorId" in record && typeof record.errorId === "string") return record.errorId;
  if (record.signal !== "span") return undefined;
  const value = record.attributes?.["relkit.error.id"];
  return typeof value === "string" ? value : undefined;
}

/**
 * Throws the invalid-query error of one request filter.
 * @param name - Filter name.
 * @param expected - Accepted values, in words.
 * @returns Never.
 */
function invalid(name: string, expected: string): never {
  throw new ObservabilityQueryError(
    "RELKIT_OBSERVABILITY_QUERY_INVALID",
    `Observability query ${name} is invalid: expected ${expected}`,
  );
}

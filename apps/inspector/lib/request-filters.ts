import type { InspectorObject, InspectorQuery } from "./api-types";
import type { SignalFilters } from "./observability-model";

/** Request outcomes the framework records, in the order the history API documents them. */
export const REQUEST_OUTCOME_OPTIONS = [
  { value: "success", label: "Success" },
  { value: "declared-error", label: "Declared error" },
  { value: "validation-error", label: "Validation error" },
  { value: "refused", label: "Refused by the framework" },
  { value: "timeout", label: "Timeout" },
  { value: "cancelled", label: "Cancelled" },
  { value: "defect", label: "Unexpected failure" },
] as const;

export interface FilterProblem {
  readonly field: keyof SignalFilters;
  readonly message: string;
}

/**
 * Inclusive range of an HTTP status filter: an exact code from 100 to 599 or a class such as
 * `5xx`. Undefined when the value is neither.
 */
export function statusRange(status: string): readonly [number, number] | undefined {
  const value = status.trim().toLowerCase();
  if (/^[1-5]\d\d$/.test(value)) return [Number(value), Number(value)];
  const family = /^([1-5])xx$/.exec(value);
  return family === null ? undefined : [Number(family[1]) * 100, Number(family[1]) * 100 + 99];
}

/**
 * Checks the values the history API rejects, with the rules it uses, so the message can sit at
 * the field instead of after a failed request.
 */
export function filterProblems(filters: SignalFilters): readonly FilterProblem[] {
  const problems: FilterProblem[] = [];
  if (filters.status !== "" && statusRange(filters.status) === undefined)
    problems.push({
      field: "status",
      message: "Status must be a code from 100 to 599, or a class such as 5xx.",
    });
  if (filters.method !== "" && !/^[A-Za-z]{1,16}$/.test(filters.method))
    problems.push({ field: "method", message: "Method must be 1 to 16 letters, such as GET." });
  if (filters.path !== "" && !filters.path.startsWith("/"))
    problems.push({ field: "path", message: "Path must start with /, for example /orders." });
  else if (filters.path.length > 512)
    problems.push({ field: "path", message: "Path must be at most 512 characters." });
  if (filters.errorId.length > 256)
    problems.push({ field: "errorId", message: "Error ID must be at most 256 characters." });
  return problems;
}

/** Whether any filter narrows the list. */
export function hasActiveFilters(filters: SignalFilters): boolean {
  return Object.values(filters).some((value) => value.trim() !== "");
}

/** "1,144 requests" for the whole list, "29 requests match" when filters narrow it. */
export function countLabel(total: number, filtered: boolean): string {
  const count = total.toLocaleString("en-US");
  if (!filtered)
    return total === 0 ? "No requests" : `${count} ${total === 1 ? "request" : "requests"}`;
  if (total === 0) return "No requests match";
  return total === 1 ? "1 request matches" : `${count} requests match`;
}

/**
 * Whether a record pushed over the live stream belongs in the list the query describes, using
 * the same rules as the history API. A started request has no status yet, so a status filter
 * leaves it out until it completes.
 */
export function matchesRequestFilters(
  value: InspectorObject,
  query: Pick<InspectorQuery, "status" | "method" | "path" | "errorId" | "search">,
): boolean {
  if (query.status !== undefined) {
    const range = statusRange(query.status);
    const status = typeof value.status === "number" ? value.status : undefined;
    if (range === undefined || status === undefined || status < range[0] || status > range[1])
      return false;
  }
  if (
    query.method !== undefined &&
    String(value.method ?? "").toUpperCase() !== query.method.trim().toUpperCase()
  )
    return false;
  if (query.path !== undefined && !String(value.rawPath ?? "").startsWith(query.path)) return false;
  if (query.errorId !== undefined && value.errorId !== query.errorId) return false;
  if (query.search !== undefined && query.search.trim() !== "")
    return JSON.stringify(value).toLowerCase().includes(query.search.trim().toLowerCase());
  return true;
}

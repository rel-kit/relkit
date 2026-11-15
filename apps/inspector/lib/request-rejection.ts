import type { SignalFilters } from "./observability-model";
import type { FilterProblem } from "./request-filters";

/** What the history API said when it refused a query: its message and the parameter to blame. */
export interface FilterRejection {
  readonly message: string;
  readonly parameter?: string | undefined;
}

/** Query parameters that the Requests filter form has a field for, by the same name. */
const FORM_FIELDS: ReadonlySet<string> = new Set<keyof SignalFilters>([
  "status",
  "method",
  "path",
  "search",
  "outcome",
  "errorId",
  "routeId",
  "functionId",
  "requestId",
  "traceId",
  "serviceId",
  "from",
  "to",
]);

/** The filter field a rejected query parameter belongs to; undefined when the form has none. */
export function rejectedField(parameter: string | undefined): keyof SignalFilters | undefined {
  return parameter !== undefined && FORM_FIELDS.has(parameter)
    ? (parameter as keyof SignalFilters)
    : undefined;
}

/**
 * Adds the server's message to the field problems, in place of a client-side message for the
 * same field. It applies only while the field still holds the value the server refused, so a
 * message does not outlive the edit that fixes it.
 */
export function withRejection(
  problems: readonly FilterProblem[],
  rejection: FilterRejection | undefined,
  applied: SignalFilters,
  draft: SignalFilters,
): readonly FilterProblem[] {
  const field = rejection === undefined ? undefined : rejectedField(rejection.parameter);
  if (rejection === undefined || field === undefined || draft[field] !== applied[field])
    return problems;
  return [
    ...problems.filter((problem) => problem.field !== field),
    { field, message: rejection.message },
  ];
}

/** The server's message for the list, when no field of the form can show it. */
export function listRejectionMessage(rejection: FilterRejection | undefined): string | undefined {
  return rejection === undefined || rejectedField(rejection.parameter) !== undefined
    ? undefined
    : rejection.message;
}

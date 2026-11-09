/** Builds RFC 9457 Problem Details bodies and responses, the format of every RelKit error response. */
import type { ProblemDetails, ProblemInput } from "./problem-details.types.js";
export type { ProblemDetails, ProblemInput, ProblemIssue } from "./problem-details.types.js";

/** Media type of every RelKit error response. */
export const PROBLEM_CONTENT_TYPE = "application/problem+json";

const TITLES: Readonly<Record<number, string>> = {
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  405: "Method Not Allowed",
  408: "Request Timeout",
  409: "Conflict",
  413: "Content Too Large",
  415: "Unsupported Media Type",
  422: "Unprocessable Content",
  429: "Too Many Requests",
  499: "Client Closed Request",
  500: "Internal Server Error",
  502: "Bad Gateway",
  503: "Service Unavailable",
  504: "Gateway Timeout",
};

/** Builds the Problem Details body for one error.
 * @param input - Status, stable code, safe detail and optional data or issues.
 * @returns The body without a trace ID, which the request middleware adds.
 */
export function problemBody(input: ProblemInput): ProblemDetails {
  return {
    type: `/errors/${input.code}`,
    title: TITLES[input.status] ?? (input.status >= 500 ? "Server Error" : "Request Error"),
    status: input.status,
    code: input.code,
    detail: input.detail,
    ...(input.data === undefined ? {} : { data: input.data }),
    ...(input.issues === undefined ? {} : { issues: input.issues }),
    ...(input.traceId === undefined ? {} : { traceId: input.traceId }),
  };
}

/** Builds a Problem Details response.
 * @param input - Status, stable code, safe detail, optional data, issues and headers.
 * @returns An `application/problem+json` response; `retryAfterMs` sets `Retry-After` in seconds.
 */
export function problemResponse(input: ProblemInput): Response {
  const headers = new Headers(input.headers);
  headers.set("content-type", PROBLEM_CONTENT_TYPE);
  if (input.retryAfterMs !== undefined)
    headers.set("retry-after", String(Math.max(0, Math.ceil(input.retryAfterMs / 1000))));
  return new Response(JSON.stringify(problemBody(input)), { status: input.status, headers });
}

/** Whether a response carries a Problem Details body.
 * @param response - Response to inspect.
 * @returns True for `application/problem+json`.
 */
export function isProblemResponse(response: Response): boolean {
  return response.headers.get("content-type")?.split(";")[0]?.trim() === PROBLEM_CONTENT_TYPE;
}

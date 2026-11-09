/** One validation issue in a Problem Details body. */
export interface ProblemIssue {
  readonly code: string;
  readonly message: string;
  readonly path: readonly (string | number)[];
}

/** RFC 9457 Problem Details body of a RelKit error response.
 * @example const body: ProblemDetails = { type: "/errors/not-found", title: "Not Found", status: 404, code: "not-found", detail: "No route matches GET /orders." };
 */
export interface ProblemDetails {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly code: string;
  readonly detail: string;
  readonly data?: unknown;
  readonly issues?: readonly ProblemIssue[];
  readonly traceId?: string;
}

/** Fields that build one Problem Details response. */
export interface ProblemInput {
  readonly status: number;
  readonly code: string;
  readonly detail: string;
  readonly data?: unknown;
  readonly issues?: readonly ProblemIssue[];
  readonly traceId?: string;
  readonly retryAfterMs?: number;
  readonly headers?: Readonly<Record<string, string>>;
}

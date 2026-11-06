/**
 * Builds Problem Details responses that carry the request's trace ID, and turns uncaught errors
 * into a 500 problem.
 */
import type { Context, Hono } from "hono";
import { getRequestState } from "./middleware-utils.js";
import { problemResponse, type ProblemInput } from "../contracts/problem-details.js";
export {
  isProblemResponse,
  PROBLEM_CONTENT_TYPE,
  problemBody,
  problemResponse,
  type ProblemDetails,
  type ProblemInput,
  type ProblemIssue,
} from "../contracts/problem-details.js";

/** Builds a Problem Details response carrying the request's trace ID.
 * @param context - Request context holding the framework request state.
 * @param input - Status, stable code, safe detail and optional data, issues or headers.
 * @returns The problem response, with `traceId` when the request has one.
 */
export function contextProblem(context: Context, input: ProblemInput): Response {
  const traceId = input.traceId ?? getRequestState(context)?.traceId;
  return problemResponse(traceId === undefined ? input : { ...input, traceId });
}

/** Turns an uncaught error into a 500 problem without internal detail.
 * @param app - Application shell.
 * @returns Nothing; installs the shell's error handler.
 */
export function installProblemDetails(app: Hono): void {
  app.onError((_error: Error, context: Context) =>
    contextProblem(context, {
      status: 500,
      code: "internal-error",
      detail: "The request failed unexpectedly.",
    }),
  );
}

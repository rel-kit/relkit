import type { RequestOutcome } from "@relkit/observability";

/** Classifies an error status that reached the response without a thrown failure.
 * Raw handlers (such as Better Auth) and middleware return error responses directly,
 * so an outcome still marked success must not hide a 4xx or 5xx status.
 * @param outcome - Outcome recorded from thrown failures, success when none was thrown.
 * @param status - Materialized response status.
 * @returns The recorded failure unchanged; otherwise the class implied by the status.
 */
export function responseOutcome(outcome: RequestOutcome, status: number): RequestOutcome {
  if (outcome !== "success" || status < 400) return outcome;
  if (status >= 500) return "defect";
  return status === 400 || status === 422 ? "validation-error" : "declared-error";
}

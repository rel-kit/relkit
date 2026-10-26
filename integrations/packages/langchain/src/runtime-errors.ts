/** Constructs invocation failures with agent identity and native causes, including selected dependency failures and execution errors. */

import type { StandardIssue } from "@relkit/schema";

/** Safe public failure fields; a non-enumerable native cause is private diagnostic data. */
export class AgentRuntimeError extends Error {
  /** @param code - Stable failure code. @param message - Safe public description.
   * @param issues - Validation issues. @param options - Private cause; never serialize or log raw. */
  constructor(
    readonly code: string,
    message: string,
    readonly issues?: readonly StandardIssue[],
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "AgentRuntimeError";
  }
}

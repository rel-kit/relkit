import type { StandardIssue } from "@relkit/schema";

/** Safe, bounded failures from the model/tool loop. No input or result is retained. */
export class AgentRuntimeError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly issues?: readonly StandardIssue[],
  ) {
    super(message);
    this.name = "AgentRuntimeError";
  }
}

import type { DeniedApproval, PendingApproval } from "./approval.types.js";

/** A malformed approval or invalid state transition.
 * @example throw new ApprovalStateError("Cannot transition approved approval");
 */
export class ApprovalStateError extends Error {
  readonly code = "RELKIT_APPROVAL_STATE_INVALID" as const;
  constructor(message: string) {
    super(message);
    this.name = "ApprovalStateError";
  }
}

/** Execution was attempted while an approval remains pending.
 * @example throw new ApprovalRequiredError(pending);
 */
export class ApprovalRequiredError extends Error {
  readonly code = "RELKIT_APPROVAL_REQUIRED" as const;
  constructor(readonly approval: PendingApproval) {
    super(`Approval required for tool "${approval.toolId}"`);
    this.name = "ApprovalRequiredError";
  }
}

/** Execution was attempted after an approval was denied.
 * @example throw new ApprovalDeniedError(denied);
 */
export class ApprovalDeniedError extends Error {
  readonly code = "RELKIT_APPROVAL_DENIED" as const;
  constructor(readonly approval: DeniedApproval) {
    super(`Approval denied for tool "${approval.toolId}"`);
    this.name = "ApprovalDeniedError";
  }
}

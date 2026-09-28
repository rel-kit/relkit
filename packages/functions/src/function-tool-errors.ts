import type { StandardIssue } from "@relkit/schema";
import type { FunctionToolApprovalRequest } from "./function-tool.js";

/** Compatibility error for malformed tool arguments.
 * @example throw new FunctionToolArgumentValidationError([{ message: "Missing id" }]);
 */
export class FunctionToolArgumentValidationError extends TypeError {
  readonly code = "RELKIT_TOOL_ARGUMENT_VALIDATION" as const;
  readonly issues: readonly StandardIssue[];

  constructor(issues: readonly StandardIssue[]) {
    super("Tool arguments failed validation");
    this.name = "ToolArgumentValidationError";
    this.issues = Object.freeze(issues.map((issue) => Object.freeze({ ...issue })));
  }
}

/** Compatibility cancellation error for a tool operation.
 * @example throw new FunctionToolOperationCancelledError();
 */
export class FunctionToolOperationCancelledError extends Error {
  readonly code = "ABORT_ERR" as const;

  constructor() {
    super("Tool operation cancelled");
    this.name = "AbortError";
  }
}

/** Compatibility error when approval is required but unavailable.
 * @example throw new FunctionToolApprovalRequiredError(request);
 */
export class FunctionToolApprovalRequiredError extends Error {
  readonly code = "RELKIT_APPROVAL_REQUIRED" as const;

  constructor(readonly approval: FunctionToolApprovalRequest) {
    super(`Approval required for tool "${approval.toolId}"`);
    this.name = "FunctionToolApprovalRequiredError";
  }
}

/** Compatibility error when a resolver denies execution.
 * @example throw new FunctionToolApprovalDeniedError(request);
 */
export class FunctionToolApprovalDeniedError extends Error {
  readonly code = "RELKIT_APPROVAL_DENIED" as const;

  constructor(readonly approval: FunctionToolApprovalRequest) {
    super(`Approval denied for tool "${approval.toolId}"`);
    this.name = "FunctionToolApprovalDeniedError";
  }
}

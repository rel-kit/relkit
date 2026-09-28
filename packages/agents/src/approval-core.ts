import { normalizeId } from "@relkit/contracts";
import { ApprovalDeniedError, ApprovalRequiredError, ApprovalStateError } from "./approval-error.js";
import type {
  ApprovalOptions,
  ApprovalPolicy,
  ApprovalRecord,
  ApprovalSideEffect,
  ApprovalState,
  ApprovedApproval,
  DeniedApproval,
  PendingApproval,
} from "./approval.types.js";

export const APPROVAL_STATES = Object.freeze(["pending", "approved", "denied"] as const);

/** Computes whether a policy requires approval.
 * @param policy - Tool approval policy.
 * @param sideEffect - Tool side effect.
 * @returns Whether execution needs a decision.
 * @throws TypeError for invalid inputs.
 * @example requiresApprovalValue("always", "read");
 */
export function requiresApprovalValue(policy: ApprovalPolicy, sideEffect: ApprovalSideEffect): boolean {
  assertPolicy(policy);
  assertSideEffect(sideEffect);
  return (
    policy === "always" || (policy === "on-write" && sideEffect !== "none" && sideEffect !== "read")
  );
}

/** Constructs a canonical approval record.
 * @param options - Call and policy metadata.
 * @returns A frozen pending or approved record.
 * @throws TypeError or ApprovalStateError for invalid metadata.
 * @example createApprovalValue(options);
 */
export function createApprovalValue(options: ApprovalOptions): ApprovalRecord {
  const required = requiresApprovalValue(options.policy, options.sideEffect);
  return makeApproval(options, required ? "pending" : "approved");
}

/** Grants a pending approval.
 * @param approval - Pending record.
 * @returns A frozen approved record.
 * @throws ApprovalStateError for an invalid transition.
 * @example approveApprovalValue(pending);
 */
export function approveApprovalValue(approval: ApprovalRecord): ApprovedApproval {
  assertTransitionable(approval);
  return makeApproval(approval, "approved");
}

/** Denies a pending approval.
 * @param approval - Pending record.
 * @returns A frozen denied record.
 * @throws ApprovalStateError for an invalid transition.
 * @example denyApprovalValue(pending);
 */
export function denyApprovalValue(approval: ApprovalRecord): DeniedApproval {
  assertTransitionable(approval);
  return makeApproval(approval, "denied");
}

/** Checks whether execution is approved.
 * @param approval - Record to validate.
 * @returns An assertion narrowing the record to ApprovedApproval.
 * @throws ApprovalRequiredError, ApprovalDeniedError, or ApprovalStateError.
 * @example assertApprovalGrantedValue(approved);
 */
export function assertApprovalGrantedValue(
  approval: ApprovalRecord,
): asserts approval is ApprovedApproval {
  const record = canonicalizeApproval(approval);
  if (record.state === "pending") throw new ApprovalRequiredError(record);
  if (record.state === "denied") throw new ApprovalDeniedError(record);
}

/** Recognizes canonical approval records.
 * @param value - Unknown candidate.
 * @returns True only for a valid record.
 * @example isApprovalRecordValue(value);
 */
export function isApprovalRecordValue(value: unknown): value is ApprovalRecord {
  try {
    canonicalizeApproval(value);
    return true;
  } catch {
    return false;
  }
}

function assertTransitionable(approval: ApprovalRecord): void {
  const record = canonicalizeApproval(approval);
  if (record.state !== "pending") {
    throw new ApprovalStateError(`Cannot transition ${record.state} approval`);
  }
}

function makeApproval(options: ApprovalOptions, state: "pending"): PendingApproval;
function makeApproval(options: ApprovalOptions, state: "approved"): ApprovedApproval;
function makeApproval(options: ApprovalOptions, state: "denied"): DeniedApproval;
function makeApproval(options: ApprovalOptions, state: ApprovalState): ApprovalRecord;
function makeApproval(options: ApprovalOptions, state: ApprovalState): ApprovalRecord {
  assertState(state);
  const invocationId = normalizeId(options.invocationId);
  const toolCallId = normalizeId(options.toolCallId);
  const toolId = normalizeId(options.toolId);
  const required = requiresApprovalValue(options.policy, options.sideEffect);
  if (!required && state !== "approved") {
    throw new ApprovalStateError("A non-required approval must be approved by policy");
  }
  return Object.freeze({
    invocationId,
    toolCallId,
    toolId,
    sideEffect: options.sideEffect,
    policy: options.policy,
    required,
    state,
  }) as ApprovalRecord;
}

function canonicalizeApproval(value: unknown): ApprovalRecord {
  if (!isRecord(value)) throw new ApprovalStateError("Approval record must be an object");
  assertState(value.state);
  const record = makeApproval(value as unknown as ApprovalOptions, value.state);
  if (
    value.required !== record.required ||
    value.invocationId !== record.invocationId ||
    value.toolCallId !== record.toolCallId ||
    value.toolId !== record.toolId ||
    value.sideEffect !== record.sideEffect ||
    value.policy !== record.policy ||
    Reflect.ownKeys(value).length !== 7
  ) {
    throw new ApprovalStateError("Approval record metadata is invalid");
  }
  return record;
}

function assertState(value: unknown): asserts value is ApprovalState {
  if (!APPROVAL_STATES.includes(value as ApprovalState)) {
    throw new ApprovalStateError("Approval state must be pending, approved, or denied");
  }
}

function assertPolicy(value: unknown): asserts value is ApprovalPolicy {
  if (value !== "never" && value !== "on-write" && value !== "always") {
    throw new TypeError("Approval policy must be never, on-write, or always");
  }
}

function assertSideEffect(value: unknown): asserts value is ApprovalSideEffect {
  if (value !== "none" && value !== "read" && value !== "write" && value !== "external") {
    throw new TypeError("Approval side effect must be none, read, write, or external");
  }
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

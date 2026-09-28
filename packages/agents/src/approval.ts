import { Effect } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import {
  approveApprovalValue,
  assertApprovalGrantedValue,
  createApprovalValue,
  denyApprovalValue,
  isApprovalRecordValue,
  requiresApprovalValue,
} from "./approval-core.js";
import { approvalEffectError, type ApprovalEffectError } from "./approval-effect-error.js";
import type {
  ApprovalOptions,
  ApprovalPolicy,
  ApprovalRecord,
  ApprovalSideEffect,
  ApprovedApproval,
  DeniedApproval,
} from "./approval.types.js";

export { APPROVAL_STATES } from "./approval-core.js";
export { ApprovalDeniedError, ApprovalRequiredError, ApprovalStateError } from "./approval-error.js";
export { ApprovalEffectError } from "./approval-effect-error.js";
export type * from "./approval.types.js";

/** Tests whether a tool call needs an explicit approval decision.
 * @param policy - Configured approval policy.
 * @param sideEffect - Tool's declared side effect.
 * @returns An Effect with the decision or ApprovalEffectError.
 * @example Effect.runSync(requiresApprovalEffect("on-write", "write"));
 */
export const requiresApprovalEffect = Effect.fn("Agents.approval.requires")(
  (policy: ApprovalPolicy, sideEffect: ApprovalSideEffect) =>
    Effect.try({ try: () => requiresApprovalValue(policy, sideEffect), catch: approvalEffectError }),
  (effect) => observeAgent("approval.requires", effect),
);

/** Tests whether a tool call needs an explicit approval decision.
 * @param policy - Configured approval policy.
 * @param sideEffect - Tool's declared side effect.
 * @returns Whether an explicit approval is required.
 * @throws TypeError for an invalid policy or side effect.
 * @example requiresApproval("on-write", "write");
 */
export function requiresApproval(policy: ApprovalPolicy, sideEffect: ApprovalSideEffect): boolean {
  return runApproval(requiresApprovalEffect(policy, sideEffect));
}

/** Creates an immutable pending or policy-approved record.
 * @param options - Call identity, policy, and side-effect metadata.
 * @returns An Effect with the record or ApprovalEffectError.
 * @example Effect.runSync(createApprovalEffect(options));
 */
export const createApprovalEffect = Effect.fn("Agents.approval.create")(
  (options: ApprovalOptions) =>
    Effect.try({ try: () => createApprovalValue(options), catch: approvalEffectError }),
  (effect) => observeAgent("approval.create", effect),
);

/** Creates an immutable pending or policy-approved record.
 * @param options - Call identity, policy, and side-effect metadata.
 * @returns A frozen approval record.
 * @throws TypeError or ApprovalStateError for invalid metadata.
 * @example createApproval({ invocationId: "run", toolCallId: "call", toolId: "send", sideEffect: "write", policy: "always" });
 */
export function createApproval(options: ApprovalOptions): ApprovalRecord {
  return runApproval(createApprovalEffect(options));
}

/** Moves a pending approval to the approved state.
 * @param approval - Pending decision to grant.
 * @returns An Effect with an approved record or ApprovalEffectError.
 * @example Effect.runSync(approveApprovalEffect(pending));
 */
export const approveApprovalEffect = Effect.fn("Agents.approval.approve")(
  (approval: ApprovalRecord) =>
    Effect.try({ try: () => approveApprovalValue(approval), catch: approvalEffectError }),
  (effect) => observeAgent("approval.approve", effect),
);

/** Moves a pending approval to the approved state.
 * @param approval - Pending decision to grant.
 * @returns A frozen approved record.
 * @throws ApprovalStateError for a malformed or final decision.
 * @example
 * ```ts
 * import { approveApproval, createApproval } from "@relkit/app/agents";
 *
 * const pending = createApproval({
 *   invocationId: "run", toolCallId: "call", toolId: "send",
 *   sideEffect: "write", policy: "always",
 * });
 * const approved = approveApproval(pending);
 * void approved;
 * ```
 * @category Approvals
 * @since 0.4.0
 */
export function approveApproval(approval: ApprovalRecord): ApprovedApproval {
  return runApproval(approveApprovalEffect(approval));
}

/** Moves a pending approval to the denied state.
 * @param approval - Pending decision to deny.
 * @returns An Effect with a denied record or ApprovalEffectError.
 * @example Effect.runSync(denyApprovalEffect(pending));
 */
export const denyApprovalEffect = Effect.fn("Agents.approval.deny")(
  (approval: ApprovalRecord) =>
    Effect.try({ try: () => denyApprovalValue(approval), catch: approvalEffectError }),
  (effect) => observeAgent("approval.deny", effect),
);

/** Moves a pending approval to the denied state.
 * @param approval - Pending decision to deny.
 * @returns A frozen denied record.
 * @throws ApprovalStateError for a malformed or final decision.
 * @example
 * ```ts
 * import { createApproval, denyApproval } from "@relkit/app/agents";
 *
 * const pending = createApproval({
 *   invocationId: "run", toolCallId: "call", toolId: "send",
 *   sideEffect: "write", policy: "always",
 * });
 * const denied = denyApproval(pending);
 * void denied;
 * ```
 * @category Approvals
 * @since 0.4.0
 */
export function denyApproval(approval: ApprovalRecord): DeniedApproval {
  return runApproval(denyApprovalEffect(approval));
}

/** Fails unless the record was approved.
 * @param approval - Decision to inspect before tool execution.
 * @returns An Effect with void or ApprovalEffectError.
 * @example Effect.runSync(assertApprovalGrantedEffect(approved));
 */
export const assertApprovalGrantedEffect = Effect.fn("Agents.approval.assertGranted")(
  (approval: ApprovalRecord) =>
    Effect.try({ try: () => assertApprovalGrantedValue(approval), catch: approvalEffectError }),
  (effect) => observeAgent("approval.assert-granted", effect),
);

/** Rejects execution unless the record is approved.
 * @param approval - Decision to inspect before tool execution.
 * @returns An assertion narrowing the record to ApprovedApproval.
 * @throws ApprovalRequiredError, ApprovalDeniedError, or ApprovalStateError.
 * @example assertApprovalGranted(approved);
 */
export function assertApprovalGranted(approval: ApprovalRecord): asserts approval is ApprovedApproval {
  runApproval(assertApprovalGrantedEffect(approval));
}

/** Checks whether a value is a canonical approval record.
 * @param value - Unknown value to inspect.
 * @returns An Effect with a boolean and no typed failure.
 * @example Effect.runSync(isApprovalRecordEffect(value));
 */
export const isApprovalRecordEffect = Effect.fn("Agents.approval.isRecord")(
  (value: unknown) => Effect.sync(() => isApprovalRecordValue(value)),
  (effect) => observeAgent("approval.is-record", effect),
);

/** Checks whether a value is a canonical approval record.
 * @param value - Unknown value to inspect.
 * @returns True for a valid, canonical record.
 * @example if (isApprovalRecord(value)) console.log(value.state);
 */
export function isApprovalRecord(value: unknown): value is ApprovalRecord {
  return Effect.runSync(isApprovalRecordEffect(value));
}

function runApproval<A>(effect: Effect.Effect<A, ApprovalEffectError>): A {
  return Effect.runSync(
    effect.pipe(Effect.catchTag("ApprovalEffectError", (error) => Effect.fail(error.cause))),
  );
}

import { normalizeId } from "@zsys/contracts";
import type { ToolApproval, ToolSideEffect } from "@zsys/tools";

export const APPROVAL_STATES = Object.freeze(["pending", "approved", "denied"] as const);
export type ApprovalState = (typeof APPROVAL_STATES)[number];
export type ApprovalPolicy = ToolApproval;
export type ApprovalSideEffect = ToolSideEffect;

export interface ApprovalOptions {
  readonly invocationId: string;
  readonly toolCallId: string;
  readonly toolId: string;
  readonly sideEffect: ApprovalSideEffect;
  readonly policy: ApprovalPolicy;
}

/** Safe, argument-free metadata for one invocation/tool-call approval decision. */
export interface ApprovalMetadata extends ApprovalOptions {
  readonly required: boolean;
  readonly state: ApprovalState;
}

export interface PendingApproval extends ApprovalMetadata {
  readonly state: "pending";
}

export interface ApprovedApproval extends ApprovalMetadata {
  readonly state: "approved";
}

export interface DeniedApproval extends ApprovalMetadata {
  readonly state: "denied";
}

export type ApprovalRecord = PendingApproval | ApprovedApproval | DeniedApproval;

export class ApprovalStateError extends Error {
  readonly code = "ZSYS_APPROVAL_STATE_INVALID" as const;

  constructor(message: string) {
    super(message);
    this.name = "ApprovalStateError";
  }
}

export class ApprovalRequiredError extends Error {
  readonly code = "ZSYS_APPROVAL_REQUIRED" as const;

  constructor(readonly approval: PendingApproval) {
    super(`Approval required for tool "${approval.toolId}"`);
    this.name = "ApprovalRequiredError";
  }
}

export class ApprovalDeniedError extends Error {
  readonly code = "ZSYS_APPROVAL_DENIED" as const;

  constructor(readonly approval: DeniedApproval) {
    super(`Approval denied for tool "${approval.toolId}"`);
    this.name = "ApprovalDeniedError";
  }
}

/** Returns whether a tool call must wait for an explicit approval decision. */
export function requiresApproval(policy: ApprovalPolicy, sideEffect: ApprovalSideEffect): boolean {
  assertPolicy(policy);
  assertSideEffect(sideEffect);
  return (
    policy === "always" || (policy === "on-write" && sideEffect !== "none" && sideEffect !== "read")
  );
}

/** Creates an immutable approval record; non-required calls are policy-approved. */
export function createApproval(options: ApprovalOptions): ApprovalRecord {
  const required = requiresApproval(options.policy, options.sideEffect);
  return makeApproval(options, required ? "pending" : "approved");
}

/** Moves a pending approval to the approved state. */
export function approveApproval(approval: ApprovalRecord): ApprovedApproval {
  assertTransitionable(approval);
  return makeApproval(approval, "approved");
}

/** Moves a pending approval to the denied state. */
export function denyApproval(approval: ApprovalRecord): DeniedApproval {
  assertTransitionable(approval);
  return makeApproval(approval, "denied");
}

/** Rejects execution unless the record is approved. */
export function assertApprovalGranted(
  approval: ApprovalRecord,
): asserts approval is ApprovedApproval {
  const record = canonicalizeApproval(approval);
  if (record.state === "pending") throw new ApprovalRequiredError(record);
  if (record.state === "denied") throw new ApprovalDeniedError(record);
}

export function isApprovalRecord(value: unknown): value is ApprovalRecord {
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
  const required = requiresApproval(options.policy, options.sideEffect);
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

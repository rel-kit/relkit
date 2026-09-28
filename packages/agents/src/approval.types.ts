import type { ToolApproval, ToolSideEffect } from "@relkit/tools";

/** One canonical approval state. */
export type ApprovalState = "pending" | "approved" | "denied";
/** Policy controlling which tool calls require approval. */
export type ApprovalPolicy = ToolApproval;
/** Declared side effect of a tool call. */
export type ApprovalSideEffect = ToolSideEffect;

/** Inputs used to create an approval record. */
export interface ApprovalOptions {
  readonly invocationId: string;
  readonly toolCallId: string;
  readonly toolId: string;
  readonly sideEffect: ApprovalSideEffect;
  readonly policy: ApprovalPolicy;
}

/** Argument-free metadata for one invocation and tool-call decision. */
export interface ApprovalMetadata extends ApprovalOptions {
  readonly required: boolean;
  readonly state: ApprovalState;
}

/** Approval that must receive a decision before execution. */
export interface PendingApproval extends ApprovalMetadata {
  readonly state: "pending";
}

/** Approval granted by policy or an explicit decision. */
export interface ApprovedApproval extends ApprovalMetadata {
  readonly state: "approved";
}

/** Approval explicitly denied. */
export interface DeniedApproval extends ApprovalMetadata {
  readonly state: "denied";
}

/** Canonical approval record in any valid state. */
export type ApprovalRecord = PendingApproval | ApprovedApproval | DeniedApproval;

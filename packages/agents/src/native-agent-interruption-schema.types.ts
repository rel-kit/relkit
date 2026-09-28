import type { JsonValue } from "@relkit/contracts";

/** Human review decision accepted by a native agent. */
export type DecisionType = "approve" | "edit" | "reject";

/** Review policy for one pending action. */
export interface ReviewConfig {
  readonly actionName: string;
  readonly allowedDecisions: readonly DecisionType[];
  readonly argsSchema?: JsonValue;
}

/** Public set of actions awaiting human review. */
export interface HitlRequest {
  readonly actionRequests: readonly Record<string, unknown>[];
  readonly reviewConfigs: readonly ReviewConfig[];
}

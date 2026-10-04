import type { AgentExecutionSnapshot } from "@relkit/contracts";

/**
 * Browser agent lifecycle and content projected from authoritative execution state.
 * @typeParam Output - Application-declared successful result payload.
 */
export interface AgentExecutionProjection<Output = unknown> {
  readonly values?: unknown;
  readonly output?: Output;
  readonly executions: readonly AgentExecutionSnapshot[];
}

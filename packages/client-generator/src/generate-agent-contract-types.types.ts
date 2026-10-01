import type { AgentClientContractMetadata } from "@relkit/graph";

/** Minimal public agent shape accepted by the contract renderer.
 * @example const agent: AgentContractSource = { input: { type: "string" }, output: { type: "string" } };
 */
export interface AgentContractSource {
  readonly input?: unknown;
  readonly output?: unknown;
  readonly controls?: unknown;
  readonly chat?: unknown;
  readonly workflow?: unknown;
  readonly clientContract?: AgentClientContractMetadata;
}

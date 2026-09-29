/** Minimal agent metadata needed to generate protocol procedures.
 * @example const source: AgentSource = { id: "orders.review", input: {} };
 */
export interface AgentSource {
  readonly id: string;
  readonly input: unknown;
  readonly chat?: unknown;
  readonly controls?: unknown;
  readonly workflow?: unknown;
}
export type { AgentNode, ApplicationGraph } from "@relkit/graph";

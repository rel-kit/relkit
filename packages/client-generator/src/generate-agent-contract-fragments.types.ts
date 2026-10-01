export type { AgentClientContractMetadata } from "@relkit/graph";

/** Agent scope discriminator rendered in the public contract.
 * @example const scope: AgentScopeSource = { kind: "dynamic" };
 */
export interface AgentScopeSource {
  readonly kind: string;
  readonly id?: string;
}

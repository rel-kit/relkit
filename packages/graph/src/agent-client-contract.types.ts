import type { JsonValue } from "@relkit/contracts";

/**
 * Schema metadata exposed to generated agent clients.
 * @remarks The compiler records this as serializable graph data.
 * @example const inspect = (value: AgentClientSchemaMetadata): void => { console.log(value); };
 */
export type AgentClientSchemaMetadata = JsonValue | { readonly kind: "dynamic" };
/**
 * Scope and visibility metadata for an agent client operation.
 * @remarks The compiler records this as serializable graph data.
 * @example const inspect = (value: AgentClientScopeMetadata): void => { console.log(value); };
 */
export type AgentClientScopeMetadata = {
  readonly kind: "agent" | "subagent" | "node" | "dynamic";
  readonly id?: string;
};

/**
 * Serializable client contract for an agent.
 * @remarks The compiler records this as serializable graph data.
 * @example const inspect = (value: AgentClientContractMetadata): void => { console.log(value); };
 */
export interface AgentClientContractMetadata {
  readonly tools: readonly (
    | {
        readonly id: string;
        readonly input: AgentClientSchemaMetadata;
        readonly output: AgentClientSchemaMetadata;
      }
    | { readonly kind: "dynamic" }
  )[];
  readonly state: readonly {
    readonly name: string;
    readonly schema: AgentClientSchemaMetadata;
    readonly optional?: true;
  }[];
  readonly events: readonly (
    | { readonly name: string; readonly schema: AgentClientSchemaMetadata }
    | { readonly kind: "dynamic" }
  )[];
  readonly scopes: readonly AgentClientScopeMetadata[];
  readonly waiting: readonly {
    readonly scope: AgentClientScopeMetadata;
    readonly response: AgentClientSchemaMetadata;
  }[];
}

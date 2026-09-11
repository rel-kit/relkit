import type { JsonValue } from "@relkit/contracts";

export type AgentClientSchemaMetadata = JsonValue | { readonly kind: "dynamic" };
export type AgentClientScopeMetadata = {
  readonly kind: "agent" | "subagent" | "node" | "dynamic";
  readonly id?: string;
};

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

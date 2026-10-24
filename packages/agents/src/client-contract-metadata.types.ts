/** Declares serializable agent client contract metadata shared by SDK-free authoring, graph normalization and runtime client projections. This companion contains the shared planning contracts without executing work. */

import type { AgentClientPolicy } from "./agent-client.js";
import type { ClientSchemaMetadata, ClientTypeField } from "./client-contract-schema.js";
import type { ToolRefAny } from "@relkit/tools";

/** Client visible event schema or dynamic event marker. */
export type ClientEventMetadata = ClientTypeField | { readonly kind: "dynamic" };

/** Client visible tool schema or dynamic tool marker. */
export type ClientToolMetadata =
  | {
      readonly id: string;
      readonly input: ClientSchemaMetadata;
      readonly output: ClientSchemaMetadata;
    }
  | { readonly kind: "dynamic" };

/** Client visible agent, subagent, or graph node scope. */
export interface ClientScopeMetadata {
  readonly kind: "agent" | "subagent" | "node" | "dynamic";
  readonly id?: string;
}

/** Client visible continuation response schema. */
export interface ClientWaitingMetadata {
  readonly scope: ClientScopeMetadata;
  readonly response: ClientSchemaMetadata;
}

/** Complete metadata needed to generate an agent client contract. */
export interface AgentClientContractMetadata {
  readonly tools: readonly ClientToolMetadata[];
  readonly state: readonly ClientTypeField[];
  readonly events: readonly ClientEventMetadata[];
  readonly scopes: readonly ClientScopeMetadata[];
  readonly waiting: readonly ClientWaitingMetadata[];
}

/** Source of nested subagent scope identities. */
export interface SubagentMetadataSource {
  readonly id: string;
  readonly subagents?: readonly SubagentMetadataSource[];
}

/** Inputs for native agent client metadata. */
export interface AgentClientMetadataOptions {
  readonly id: string;
  readonly tools: readonly ToolRefAny[];
  readonly middleware?: readonly [];
  readonly client?: AgentClientPolicy;
  readonly subagents?: readonly SubagentMetadataSource[];
  readonly interruptOn?: Readonly<Record<string, unknown>>;
}

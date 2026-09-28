import type { DescriptorBase, DescriptorMetadata } from "@relkit/contracts";
import type { AgentRef } from "@relkit/functions";
import type { StandardSchemaV1 } from "@relkit/schema";
import type { AgentChatMapping, AgentClientPolicy, AgentControl } from "./agent-client.js";
import type { AgentClientContractMetadata } from "./client-contract-metadata.js";
import type {
  AgentClientStateKey,
  AgentMiddleware,
  AgentModel,
  AgentTool,
} from "./define-agent-native.js";
import type { DeepAgentCapabilities } from "./define-agent-deep.js";

export interface PromptTemplate {
  readonly template: string;
  readonly variables?: readonly string[];
}

export interface PromptInstructions {
  readonly kind: "prompt";
  readonly id: string;
  readonly ref: { readonly kind: "prompt"; readonly id: string };
  readonly value: string | readonly string[];
}

export type AgentInstructions = string | PromptTemplate | PromptInstructions;

export interface AgentLimits {
  readonly maxSteps: number;
  readonly maxToolCalls: number;
  readonly timeoutMs: number;
}

export interface AgentDescriptor<
  Id extends string,
  Input,
  Output,
  InputSchema extends StandardSchemaV1 = StandardSchemaV1,
  OutputSchema extends StandardSchemaV1 = StandardSchemaV1,
  Middleware extends readonly AgentMiddleware[] = readonly AgentMiddleware[],
  Tools extends readonly AgentTool[] = readonly AgentTool[],
>
  extends
    DescriptorBase<"agent", Id>,
    AgentRef<Id, InputSchema, OutputSchema>,
    DeepAgentCapabilities {
  readonly model?: AgentModel;
  readonly instructions: AgentInstructions;
  readonly tools: Tools;
  readonly middleware: Middleware;
  readonly limits: AgentLimits;
  readonly stateProfile?: string;
  readonly client?: AgentClientPolicy<(...args: any[]) => unknown, AgentClientStateKey<Middleware>>;
  readonly chat?: AgentChatMapping;
  readonly controls?: readonly AgentControl[];
  readonly clientContract: AgentClientContractMetadata;
}

export interface DefineAgentOptions<
  Id extends string,
  InputSchema extends StandardSchemaV1,
  OutputSchema extends StandardSchemaV1,
  Middleware extends readonly AgentMiddleware[],
  Tools extends readonly AgentTool[],
>
  extends DescriptorMetadata, DeepAgentCapabilities {
  readonly id?: Id;
  readonly input: InputSchema;
  readonly output: OutputSchema;
  readonly model?: AgentModel;
  readonly instructions: AgentInstructions;
  readonly tools: Tools;
  readonly middleware?: Middleware;
  readonly limits: AgentLimits;
  readonly stateProfile?: string;
  readonly client?: AgentClientPolicy<(...args: any[]) => unknown, AgentClientStateKey<Middleware>>;
  readonly chat?: AgentChatMapping;
  readonly controls?: readonly AgentControl[];
}

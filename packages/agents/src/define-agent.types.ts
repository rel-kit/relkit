/**
 * Defines the SDK-independent agent contract used by generic application authoring.
 * Native model, middleware, graph and persistence APIs are owned by @relkit/langchain.
 */
import type { DescriptorBase, DescriptorMetadata } from "@relkit/contracts";
import type { AgentRef } from "@relkit/functions";
import type { StandardSchemaV1 } from "@relkit/schema";
import type { ToolRefAny } from "@relkit/tools";
import type { AgentChatMapping, AgentClientPolicy, AgentControl } from "./agent-client.js";
import type { AgentClientContractMetadata } from "./client-contract-metadata.types.js";

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

/** Limits retained by the selected execution integration. */
export interface AgentLimits {
  readonly maxSteps: number;
  readonly maxToolCalls: number;
  readonly timeoutMs: number;
}

/** Handler-free tool identities retaining each authored literal reference. */
export type AgentToolReferences<Tools extends readonly ToolRefAny[]> = {
  readonly [Index in keyof Tools]: Pick<Tools[Index], "ref">;
};

/** Plain agent metadata; no execution SDK is evaluated by this declaration. */
export interface AgentDescriptor<
  Id extends string,
  Input,
  Output,
  InputSchema extends StandardSchemaV1 = StandardSchemaV1,
  OutputSchema extends StandardSchemaV1 = StandardSchemaV1,
  Tools extends readonly ToolRefAny[] = readonly ToolRefAny[],
>
  extends DescriptorBase<"agent", Id>, AgentRef<Id, InputSchema, OutputSchema> {
  readonly model?: string;
  readonly instructions: AgentInstructions;
  readonly tools: AgentToolReferences<Tools>;
  readonly middleware: readonly [];
  readonly limits: AgentLimits;
  readonly stateProfile?: string;
  readonly client?: AgentClientPolicy<NonNullable<AgentClientPolicy["authorize"]>, never>;
  readonly chat?: AgentChatMapping;
  readonly controls?: readonly AgentControl[];
  readonly clientContract: AgentClientContractMetadata;
}

/** Generic agent inputs; native capabilities use the explicit integration facade. */
export interface DefineAgentOptions<
  Id extends string,
  InputSchema extends StandardSchemaV1,
  OutputSchema extends StandardSchemaV1,
  Tools extends readonly ToolRefAny[],
> extends DescriptorMetadata {
  readonly id?: Id;
  readonly input: InputSchema;
  readonly output: OutputSchema;
  readonly model?: string;
  readonly instructions: AgentInstructions;
  readonly tools: Tools;
  readonly middleware?: readonly [];
  readonly limits: AgentLimits;
  readonly stateProfile?: string;
  readonly client?: AgentClientPolicy<NonNullable<AgentClientPolicy["authorize"]>, never>;
  readonly chat?: AgentChatMapping;
  readonly controls?: readonly AgentControl[];
}

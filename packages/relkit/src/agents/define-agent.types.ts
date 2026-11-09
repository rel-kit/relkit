/**
 * Defines the portable agent contract. The `runtime` adapter executes the agent; adapter-specific
 * options such as LangChain middleware live in that adapter's options.
 */
import type { DescriptorBase, DescriptorMetadata } from "../contracts/index.js";
import type { AgentRef } from "../functions/index.js";
import type { StandardSchemaV1 } from "../schema/index.js";
import type { ToolRefAny } from "../tools/index.js";
import type { AgentChatMapping, AgentClientPolicy, AgentControl } from "./agent-client.js";
import type { AgentClientContractMetadata } from "./client-contract-metadata.types.js";
import type {
  AgentRuntimeAdapterAny,
  AgentRuntimeNativeFields,
  AgentRuntimeReference,
  AgentRuntimeStateKey,
} from "../agent-adapters/index.js";

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
  AdapterId extends string = string,
>
  extends DescriptorBase<"agent", Id>, AgentRef<Id, InputSchema, OutputSchema> {
  /** Model profile bound in `relkit.config.ts`, optionally with a model override (`default:gpt-5`). */
  readonly model?: string;
  /** The adapter that executes the agent. */
  readonly runtime: AgentRuntimeReference<AdapterId>;
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

/** Portable agent inputs plus the `runtime` adapter that executes the agent. */
export interface DefineAgentOptions<
  Id extends string,
  InputSchema extends StandardSchemaV1,
  OutputSchema extends StandardSchemaV1,
  Tools extends readonly ToolRefAny[],
  Runtime extends AgentRuntimeAdapterAny = AgentRuntimeAdapterAny,
> extends DescriptorMetadata {
  readonly id?: Id;
  readonly input: InputSchema;
  readonly output: OutputSchema;
  /** Adapter that executes the agent, such as `langchain()` from `@relkit/langchain`. */
  readonly runtime: Runtime;
  /** Model profile bound in `relkit.config.ts`; omitted uses the `default` profile. */
  readonly model?: string;
  readonly instructions: AgentInstructions;
  readonly tools: Tools;
  readonly limits: AgentLimits;
  readonly stateProfile?: string;
  readonly client?: AgentClientPolicy<
    NonNullable<AgentClientPolicy["authorize"]>,
    AgentRuntimeStateKey<Runtime>
  >;
  readonly chat?: AgentChatMapping;
  readonly controls?: readonly AgentControl[];
}

/**
 * Descriptor `defineAgent` returns: the portable descriptor with the adapter's native fields.
 */
export type AgentDefinition<
  Id extends string,
  InputSchema extends StandardSchemaV1,
  OutputSchema extends StandardSchemaV1,
  Tools extends readonly ToolRefAny[],
  Runtime extends AgentRuntimeAdapterAny,
> = Omit<
  AgentDescriptor<
    Id,
    import("../schema/index.js").InferInput<InputSchema>,
    import("../schema/index.js").InferOutput<OutputSchema>,
    InputSchema,
    OutputSchema,
    Tools,
    Runtime["adapterId"]
  >,
  keyof AgentRuntimeNativeFields<Runtime>
> &
  AgentRuntimeNativeFields<Runtime>;

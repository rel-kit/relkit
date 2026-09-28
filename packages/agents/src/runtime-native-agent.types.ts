import type { LanguageModelLike } from "@langchain/core/language_models/base";
import type { createAgent } from "langchain";
import type { AgentDescriptor } from "./define-agent.js";
import type { AgentInvocationOptions, AgentRuntimeOptions } from "./runtime.js";

/** Runtime options narrowed to a native agent descriptor. */
export type NativeAgentRuntimeOptions = Omit<AgentRuntimeOptions, "agent"> &
  AgentInvocationOptions & {
    readonly agent: AgentDescriptor<string, unknown, unknown>;
  };

/** Native LangChain agent runnable. */
export type NativeAgent = ReturnType<typeof createAgent>;

/** Inputs required to build one native agent invocation. */
export interface CreateNativeAgentOptions {
  readonly runtime: NativeAgentRuntimeOptions;
  readonly model: string | LanguageModelLike;
  readonly signal: AbortSignal;
  readonly maxOutputBytes: number;
  readonly invocationId: string;
  readonly traceId: string;
}

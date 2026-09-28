import type { LanguageModelLike } from "@langchain/core/language_models/base";
import type { AgentModel } from "./define-agent-native.types.js";

/** Inputs used to select a native model and content limits. */
export interface RuntimeModelOptions {
  readonly model?: AgentModel;
  readonly registry: unknown;
  readonly environment: Readonly<Record<string, unknown>>;
  readonly maxInputBytes?: number;
  readonly maxOutputBytes?: number;
}

/** Validated maximum byte counts for agent input and output. */
export interface AgentContentLimits {
  readonly maxInputBytes: number;
  readonly maxOutputBytes: number;
}

/** Selected native model and validated content limits. */
export interface ResolvedRuntimeModel extends AgentContentLimits {
  readonly id: string;
  readonly model: string | LanguageModelLike;
}

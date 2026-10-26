/** Coordinates native invocation steps, output validation and settlement while retaining tool, interruption and stream finalization order. This companion preserves the native input and output types without starting runtime work. */

import type { LanguageModelLike } from "@langchain/core/language_models/base";
import type { AgentInvocationOptions, AgentRuntimeOptions } from "./runtime.js";

/** Runtime and invocation options consumed by the native model loop. */
export type AgentLoopOptions = AgentRuntimeOptions & AgentInvocationOptions;

/** Resolved native model or provider selector. */
export type NativeModel = string | LanguageModelLike;

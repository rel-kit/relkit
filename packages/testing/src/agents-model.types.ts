import type { Effect } from "effect";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { TestAgentModel } from "./agents-types.js";
import type { TestAgentModelCall, TestModelTurn } from "./agents-types.js";

/** Effect script state, detached call capture and cancellable native turn decisions. */
export interface ModelScriptService {
  readonly turn: (
    request: TestAgentModelCall["request"],
    signal?: AbortSignal,
  ) => Effect.Effect<TestModelTurn, unknown>;
  readonly script: (turns: readonly TestModelTurn[]) => Effect.Effect<void, unknown>;
  readonly reset: Effect.Effect<void>;
  readonly calls: Effect.Effect<readonly TestAgentModelCall[]>;
}

/** Native LangChain-compatible scripted model with owned release. */
export interface RuntimeTestAgentModel extends TestAgentModel {
  readonly languageModel: BaseChatModel;
}

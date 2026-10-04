import type { CallbackManagerForLLMRun } from "@langchain/core/callbacks/manager";
import {
  BaseChatModel,
  type BaseChatModelParams,
  type BindToolsInput,
} from "@langchain/core/language_models/chat_models";
import { AIMessage, type BaseMessage } from "@langchain/core/messages";

import type { ChatResult } from "@langchain/core/outputs";
import type { TestAgentModelCall, TestModelTurn } from "./agents-types.js";

/** Native LangChain model transport; script and cancellation remain owned by TestModelScript. */
export class ScriptedChatModel extends BaseChatModel {
  private boundTools: readonly BindToolsInput[] = [];

  /**
   * Connects native generation to the acquired script service.
   * @param turn Owner script workflow consuming the native AbortSignal.
   * @param provider Native test provider identity.
   * @param modelId Native test model identity.
   */
  constructor(
    private readonly turn: (
      request: TestAgentModelCall["request"],
      signal?: AbortSignal,
    ) => Promise<TestModelTurn>,
    private readonly provider: string,
    private readonly modelId: string,
  ) {
    super({} satisfies BaseChatModelParams);
  }

  /** @returns The native provider/model identity used by LangChain. */
  _llmType(): string {
    return `${this.provider}:${this.modelId}`;
  }

  /**
   * Records native presented tools for script-to-tool name matching.
   * @param tools Model-presented tool declarations.
   * @returns This native model, preserving LangChain binding behavior.
   */
  override bindTools(tools: BindToolsInput[]): this {
    this.boundTools = [...tools];
    return this;
  }

  /**
   * Consumes one owned scripted turn using the native invocation signal.
   * @param messages Native LangChain messages projected for assertions.
   * @param _options Native generation options, including cancellation.
   * @param _runManager Native callback manager retained by the base-model signature.
   * @returns The original native tool-call/final-output ChatResult representation.
   */
  override async _generate(
    messages: BaseMessage[],
    _options?: this["ParsedCallOptions"],
    _runManager?: CallbackManagerForLLMRun,
  ): Promise<ChatResult> {
    const turn = await this.turn(
      {
        messages: messages.map(snapshotMessage),
        tools: this.boundTools.map(snapshotTool),
      },
      _options?.signal,
    );
    if (turn.type === "error" || turn.type === "cancelled") {
      throw new Error(turn.type === "error" ? turn.message : (turn.reason ?? "cancelled"));
    }
    const toolCall =
      turn.type === "tool-call"
        ? {
            name: presentedToolName(turn.toolId, this.boundTools),
            args: turn.input as Record<string, unknown>,
            id: turn.callId,
            type: "tool_call" as const,
          }
        : {
            name: "relkit_output",
            args: { value: turn.output },
            id: "relkit-test-output",
            type: "tool_call" as const,
          };
    return {
      generations: [{ text: "", message: new AIMessage({ content: "", tool_calls: [toolCall] }) }],
      llmOutput: {},
    };
  }
}

/**
 * Projects the native message role and content for deterministic call assertions.
 * @param message - Native language-model message.
 * @returns The same visible message fields without exposing model internals.
 */
function snapshotMessage(message: BaseMessage): unknown {
  return { role: message.getType(), content: contentValue(message.content) };
}

/**
 * Decodes JSON text when valid while retaining native non-JSON content.
 * @param value - Candidate native value checked or detached by this helper.
 * @returns The existing JSON value or original content.
 */
function contentValue(value: BaseMessage["content"]): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/**
 * Projects only the native tool name used by model call assertions.
 * @param value - Candidate native value checked or detached by this helper.
 * @returns A bounded tool name snapshot.
 */
function snapshotTool(value: BindToolsInput): unknown {
  return { name: "name" in value ? value.name : undefined };
}

/**
 * Selects the native presented tool name corresponding to a declared tool ID.
 * @param id - Declared resource or tool identity.
 * @param tools - Native model-presented tool declarations.
 * @returns The registered model name or the original tool ID.
 */
function presentedToolName(id: string, tools: readonly BindToolsInput[]): string {
  const prefix = id.replaceAll(".", "_");
  const tool = tools.find(
    (entry) => "name" in entry && (entry.name === prefix || entry.name.startsWith(`${prefix}_`)),
  );
  return tool && "name" in tool ? tool.name : id;
}

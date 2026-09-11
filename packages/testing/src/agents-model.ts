import type { CallbackManagerForLLMRun } from "@langchain/core/callbacks/manager";
import {
  BaseChatModel,
  type BaseChatModelParams,
  type BindToolsInput,
} from "@langchain/core/language_models/chat_models";
import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import type { ChatResult } from "@langchain/core/outputs";
import type {
  TestAgentModel,
  TestAgentModelCall,
  TestAgentModelOptions,
  TestModelTurn,
} from "./agents-types.js";

interface RuntimeTestAgentModel extends TestAgentModel {
  readonly languageModel: BaseChatModel;
}

class ScriptedChatModel extends BaseChatModel {
  private boundTools: readonly BindToolsInput[] = [];

  constructor(
    private readonly turn: (request: TestAgentModelCall["request"]) => Promise<TestModelTurn>,
    private readonly provider: string,
    private readonly modelId: string,
  ) {
    super({} satisfies BaseChatModelParams);
  }

  _llmType(): string {
    return `${this.provider}:${this.modelId}`;
  }

  override bindTools(tools: BindToolsInput[]): this {
    this.boundTools = [...tools];
    return this;
  }

  override async _generate(
    messages: BaseMessage[],
    _options?: this["ParsedCallOptions"],
    _runManager?: CallbackManagerForLLMRun,
  ): Promise<ChatResult> {
    const turn = await this.turn({
      messages: messages.map(snapshotMessage),
      tools: this.boundTools.map(snapshotTool),
    });
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

export function createTestModel(
  options: TestAgentModelOptions & { readonly script?: readonly TestModelTurn[] } = {},
): RuntimeTestAgentModel {
  let turns: readonly TestModelTurn[] = [];
  let nextTurn = 0;
  const calls: TestAgentModelCall[] = [];
  const provider = options.provider ?? "test";
  const modelId = options.modelId ?? "default";
  const languageModel = new ScriptedChatModel(
    async (request) => {
      if (options.hang === true) return new Promise(() => undefined);
      const turn = turns[nextTurn++];
      if (turn === undefined) throw new Error("Test model script exhausted");
      calls.push(Object.freeze({ index: calls.length, request: Object.freeze(request), turn }));
      return turn;
    },
    provider,
    modelId,
  );
  const script = (value: readonly TestModelTurn[]): void => {
    if (!Array.isArray(value)) throw new TypeError("Test model script must be an array");
    turns = Object.freeze([...value]);
    nextTurn = 0;
    calls.length = 0;
  };
  const reset = (): void => {
    nextTurn = 0;
    calls.length = 0;
  };
  script(options.script ?? []);
  return Object.freeze({
    provider,
    modelId,
    languageModel,
    script,
    reset,
    get calls(): readonly TestAgentModelCall[] {
      return Object.freeze([...calls]);
    },
  });
}

function snapshotMessage(message: BaseMessage): unknown {
  return { role: message.getType(), content: contentValue(message.content) };
}

function contentValue(value: BaseMessage["content"]): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function snapshotTool(value: BindToolsInput): unknown {
  return { name: "name" in value ? value.name : undefined };
}

function presentedToolName(id: string, tools: readonly BindToolsInput[]): string {
  const prefix = id.replaceAll(".", "_");
  const tool = tools.find(
    (entry) => "name" in entry && (entry.name === prefix || entry.name.startsWith(`${prefix}_`)),
  );
  return tool && "name" in tool ? tool.name : id;
}

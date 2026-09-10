import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import type { ChatResult } from "@langchain/core/outputs";
import type { CallbackManagerForLLMRun } from "@langchain/core/callbacks/manager";
import {
  BaseChatModel,
  type BaseChatModelParams,
  type BindToolsInput,
} from "@langchain/core/language_models/chat_models";
import type { JsonValue } from "@relkit/contracts";
import { modelToolName } from "./src/runtime-tools.ts";

const STRUCTURED_OUTPUT_TOOL = "relkit_output";

export type TestModelTurn =
  | {
      readonly type: "tool-call";
      readonly callId: string;
      readonly toolId: string;
      readonly input: JsonValue;
      readonly native?: boolean;
    }
  | { readonly type: "final"; readonly output: JsonValue };

class RecordingTestModel extends BaseChatModel {
  readonly calls: unknown[] = [];
  private nextTurn = 0;

  constructor(private readonly turns: readonly TestModelTurn[]) {
    super({} satisfies BaseChatModelParams);
  }

  _llmType(): string {
    return "relkit-test";
  }

  override bindTools(_tools: BindToolsInput[]): this {
    return this;
  }

  override async _generate(
    messages: BaseMessage[],
    options?: this["ParsedCallOptions"],
    runManager?: CallbackManagerForLLMRun,
  ): Promise<ChatResult> {
    this.calls.push({
      messages: messages.map((message) => ({
        role: message.getType(),
        content: message.content,
      })),
    });
    void options;
    void runManager;
    const turn = this.turns[this.nextTurn++];
    if (turn === undefined) throw new Error("Test model script exhausted");
    const toolCall =
      turn.type === "tool-call"
        ? {
            name: turn.native
              ? turn.toolId
              : modelToolName(
                  turn.toolId,
                  this.turns.findIndex(
                    (candidate) =>
                      candidate.type === "tool-call" && candidate.toolId === turn.toolId,
                  ),
                ),
            args: turn.input as Record<string, unknown>,
            id: turn.callId,
            type: "tool_call" as const,
          }
        : {
            name: STRUCTURED_OUTPUT_TOOL,
            args: { value: turn.output },
            id: `output-${this.nextTurn}`,
            type: "tool_call" as const,
          };
    return {
      generations: [
        {
          text: "",
          message: new AIMessage({ content: "", tool_calls: [toolCall] }),
        },
      ],
      llmOutput: {},
    };
  }
}

export function createTestModel(
  turns: readonly TestModelTurn[],
  _options: { readonly provider?: string; readonly modelId?: string } = {},
): { readonly model: RecordingTestModel; readonly calls: readonly unknown[] } {
  const model = new RecordingTestModel(turns);
  return { model, calls: model.calls };
}

export function createHangingTestModel(): {
  readonly model: BaseChatModel;
  readonly calls: readonly unknown[];
} {
  const calls: unknown[] = [];
  class HangingModel extends BaseChatModel {
    _llmType(): string {
      return "relkit-hanging-test";
    }

    override async _generate(): Promise<ChatResult> {
      calls.push({});
      return new Promise(() => undefined);
    }
  }
  return { model: new HangingModel({}), calls };
}

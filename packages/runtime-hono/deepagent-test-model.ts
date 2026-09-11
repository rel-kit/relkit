import type { CallbackManagerForLLMRun } from "@langchain/core/callbacks/manager";
import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import {
  BaseChatModel,
  type BaseChatModelParams,
  type BindToolsInput,
} from "@langchain/core/language_models/chat_models";
import type { ChatResult } from "@langchain/core/outputs";
import { z } from "@relkit/schema";
import { tool } from "langchain";

interface ScriptedToolCall {
  readonly name: string;
  readonly args: Record<string, unknown>;
  readonly id: string;
  readonly type: "tool_call";
}

class ScriptedTestModel extends BaseChatModel {
  readonly calls: unknown[] = [];
  private turn = 0;

  constructor(private readonly toolCalls: readonly ScriptedToolCall[]) {
    super({} satisfies BaseChatModelParams);
  }

  _llmType(): string {
    return "relkit-hitl-test";
  }

  override bindTools(_tools: BindToolsInput[]): this {
    return this;
  }

  override async _generate(
    messages: BaseMessage[],
    _options?: this["ParsedCallOptions"],
    _runManager?: CallbackManagerForLLMRun,
  ): Promise<ChatResult> {
    this.calls.push(messages);
    const toolCall = this.toolCalls[this.turn++];
    if (toolCall === undefined) throw new Error("Test model script exhausted.");
    return {
      generations: [{ text: "", message: new AIMessage({ content: "", tool_calls: [toolCall] }) }],
      llmOutput: {},
    };
  }
}

export function createHitlTestModel(): BaseChatModel {
  return new ScriptedTestModel([
    {
      name: "danger",
      args: { value: "approved" },
      id: "danger-1",
      type: "tool_call",
    },
    {
      name: "relkit_output",
      args: { value: { answer: "finished" } },
      id: "output-2",
      type: "tool_call",
    },
  ]);
}

export function createTodoTestModel(states: readonly unknown[]) {
  const toolCalls: ScriptedToolCall[] = states.map((todos, index) => ({
    name: "write_todos",
    args: { todos },
    id: `todo-${index + 1}`,
    type: "tool_call",
  }));
  toolCalls.push({
    name: "relkit_output",
    args: { value: { answer: "The order is ready." } },
    id: "todo-output",
    type: "tool_call",
  });
  const model = new ScriptedTestModel(toolCalls);
  return { model, calls: model.calls };
}

export function createNativeStringTool(
  name: string,
  handler: (input: { readonly value: string }) => string | Promise<string>,
) {
  return tool(handler, {
    name,
    description: `${name} a value.`,
    schema: z.object({ value: z.string() }),
  });
}

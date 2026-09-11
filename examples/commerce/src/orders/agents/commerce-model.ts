import type { CallbackManagerForLLMRun } from "@langchain/core/callbacks/manager";
import {
  BaseChatModel,
  type BaseChatModelParams,
  type BindToolsInput,
} from "@langchain/core/language_models/chat_models";
import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import type { ChatResult } from "@langchain/core/outputs";

const pendingTodos = [
  { content: "Find the order", status: "in_progress" },
  { content: "Explain its state", status: "pending" },
];
const completedTodos = [
  { content: "Find the order", status: "completed" },
  { content: "Explain its state", status: "completed" },
];

type ModelMode = "support" | "deep";

class CommerceModel extends BaseChatModel {
  constructor(private readonly mode: ModelMode) {
    super({} satisfies BaseChatModelParams);
  }

  _llmType(): string {
    return `commerce-${this.mode}`;
  }

  override bindTools(_tools: BindToolsInput[]): this {
    return this;
  }

  override async _generate(
    messages: BaseMessage[],
    _options?: this["ParsedCallOptions"],
    _runManager?: CallbackManagerForLLMRun,
  ): Promise<ChatResult> {
    const turn = this.mode === "deep" ? deepTurn(messages) : supportTurn(messages);
    const message =
      typeof turn === "string"
        ? new AIMessage(turn)
        : new AIMessage({ content: "", tool_calls: [turn] });
    return {
      generations: [{ text: typeof turn === "string" ? turn : "", message }],
      llmOutput: {},
    };
  }
}

export function createCommerceModel(mode: ModelMode): BaseChatModel {
  return new CommerceModel(mode);
}

function supportTurn(messages: BaseMessage[]) {
  const completedTools = messages.filter((message) => message.getType() === "tool").length;
  if (completedTools === 0) return call("write_todos", { todos: pendingTodos }, "todo-start");
  if (completedTools === 1) return call("order_status", { orderId: "demo-1" }, "status");
  if (completedTools === 2) return call("write_todos", { todos: completedTodos }, "todo-finish");
  return output("Order demo-1 is ready.");
}

function deepTurn(messages: BaseMessage[]) {
  const prompt = messages.map((message) => String(message.content)).join("\n");
  if (
    prompt.includes("COMMERCE_INVENTORY_SPECIALIST") ||
    prompt.includes("Check inventory for demo-1.")
  ) {
    return "Inventory is available.";
  }
  const delegated = messages.some((message) => message.getType() === "tool");
  return delegated
    ? output("The inventory specialist confirmed availability.")
    : call(
        "task",
        { description: "Check inventory for demo-1.", subagent_type: "inventory-specialist" },
        "delegate-inventory",
      );
}

function output(answer: string) {
  return call("relkit_output", { value: { answer } }, "final-output");
}

function call(name: string, args: Record<string, unknown>, id: string) {
  return { name, args, id, type: "tool_call" as const };
}

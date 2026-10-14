/** Supplies deterministic native LangChain turns for support/delegation demos; model calls use only supplied messages. */
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

import type { CommerceModelMode, CommerceToolArguments } from "./commerce-model.types.js";

/** Native LangChain adapter selecting pure demo turns without remote model acquisition. */
class CommerceModel extends BaseChatModel {
  /** Selects the pure response sequence while retaining native LangChain ownership.
   * @param mode - Support or specialist-delegation conversation behavior. */
  constructor(private readonly mode: CommerceModelMode) {
    super({} satisfies BaseChatModelParams);
  }

  /** Identifies this deterministic model to native LangChain instrumentation.
   * @returns The stable commerce model name for the selected mode. */
  _llmType(): string {
    return `commerce-${this.mode}`;
  }

  /** Accepts native tool binding without changing the fixed offline response sequence.
   * @param _tools - Native caller declarations; scripted turns already name their tools.
   * @returns This model, preserving the SDK's fluent binding contract. */
  override bindTools(_tools: BindToolsInput[]): this {
    return this;
  }

  /** Produces the next native response from the current demo conversation.
   * @param messages - Native LangChain messages observed so far.
   * @param _options - Borrowed SDK call options; this offline model requires none.
   * @param _runManager - Borrowed SDK callback manager retained by the caller.
   * @returns A native chat result containing text or one deterministic tool call. */
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

/** Creates the offline model used by support and inventory-delegation agents.
 * @param mode - Selects the deterministic tool-call sequence.
 * @returns A native LangChain chat model with no remote transport. */
export function createCommerceModel(mode: CommerceModelMode): BaseChatModel {
  return new CommerceModel(mode);
}

/** Advances the support workflow according to completed native tool messages.
 * @param messages - Current conversation, including observed tool completions.
 * @returns The next todo/status call or validated final-output call. */
function supportTurn(messages: BaseMessage[]) {
  const completedTools = messages.filter((message) => message.getType() === "tool").length;
  if (completedTools === 0) return call("write_todos", { todos: pendingTodos }, "todo-start");
  if (completedTools === 1) return call("order_status", { orderId: "demo-1" }, "status");
  if (completedTools === 2) return call("write_todos", { todos: completedTodos }, "todo-finish");
  return output("Order demo-1 is ready.");
}

/** Answers specialist prompts or advances the parent inventory delegation.
 * @param messages - Native conversation containing prompt and completed tools.
 * @returns A specialist answer, delegation call or final-output call. */
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

/** Constructs the native final-answer tool call consumed by RELKIT output validation.
 * @param answer - Deterministic answer text.
 * @returns The established relkit_output call envelope. */
function output(answer: string) {
  return call("relkit_output", { value: { answer } }, "final-output");
}

/** Constructs one native tool-call envelope while preserving its supplied identity.
 * @param name - Registered native tool name.
 * @param args - Exact demo arguments for that tool.
 * @param id - Stable conversation-local tool-call identity.
 * @returns The native LangChain tool call consumed by the agent loop. */
function call(name: string, args: CommerceToolArguments, id: string) {
  return { name, args, id, type: "tool_call" as const };
}

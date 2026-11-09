/**
 * Runtime half of the LangChain adapter for the shared agent loop: one model turn runs a LangChain
 * chat model with the bridged tools bound; RelKit's loop owns everything else.
 */
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import {
  createAgentAdapterRuntime,
  type AgentAdapterRuntime,
  type AgentThreadMessage,
  type AgentToolDefinition,
} from "relkit/agent-adapters";

interface ToolBindingModel {
  readonly bindTools?: (tools: readonly unknown[]) => { readonly invoke: BaseChatModel["invoke"] };
  readonly invoke: BaseChatModel["invoke"];
}

/**
 * The LangChain adapter's runtime half, used by the shared agent loop and the conformance suite.
 * @example const execution = langchainAgentRuntime.execution(context);
 * @experimental
 */
export const langchainAgentRuntime: AgentAdapterRuntime<"langchain"> = createAgentAdapterRuntime({
  adapterId: "langchain",
  turn: async ({ model, messages, tools, signal }) => {
    const chat = await chatModel(model.model);
    const bound = chat.bindTools?.(tools.map(toolSpec)) ?? chat;
    const response = await bound.invoke(messages.map(nativeMessage), { signal });
    return {
      text: contentText(response.content),
      toolCalls: (response.tool_calls ?? []).map((call, index) => ({
        toolCallId: call.id ?? `call-${index}`,
        name: call.name,
        input: call.args,
      })),
    };
  },
});

async function chatModel(model: unknown): Promise<ToolBindingModel> {
  if (typeof model === "string") {
    const { initChatModel } = await import("langchain/chat_models/universal");
    return (await initChatModel(model)) as unknown as ToolBindingModel;
  }
  if (model !== null && typeof model === "object" && "invoke" in model) {
    return model as ToolBindingModel;
  }
  throw new TypeError("The LangChain adapter needs a LangChain chat model or a model name");
}

function toolSpec(tool: AgentToolDefinition) {
  return {
    type: "function",
    function: { name: tool.name, description: tool.description, parameters: tool.inputSchema },
  };
}

function nativeMessage(message: AgentThreadMessage): BaseMessage {
  switch (message.role) {
    case "system":
      return new SystemMessage(message.content);
    case "user":
      return new HumanMessage(message.content);
    case "tool":
      return new ToolMessage({ content: message.content, tool_call_id: message.toolCallId });
    case "assistant":
      return new AIMessage({
        content: message.content,
        tool_calls: (message.toolCalls ?? []).map((call) => ({
          id: call.toolCallId,
          name: call.name,
          args: (call.input ?? {}) as Record<string, unknown>,
          type: "tool_call" as const,
        })),
      });
  }
}

function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) =>
      part !== null &&
      typeof part === "object" &&
      typeof (part as { text?: unknown }).text === "string"
        ? (part as { text: string }).text
        : "",
    )
    .join("");
}

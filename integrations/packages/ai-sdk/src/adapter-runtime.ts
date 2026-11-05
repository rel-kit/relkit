/**
 * Runtime half of the AI SDK adapter for the shared agent loop: one model turn is one `generateText`
 * call with the bridged tools declared and no `execute`, so RelKit's loop runs every tool.
 */
import { generateText, jsonSchema, tool, type LanguageModel, type ModelMessage } from "ai";
import {
  createAgentAdapterRuntime,
  type AgentAdapterRuntime,
  type AgentThreadMessage,
} from "relkit/agent-adapters";

/**
 * The AI SDK adapter's runtime half, used by the shared agent loop and the conformance suite.
 * @example const execution = aiSdkAgentRuntime.execution(context);
 * @experimental
 */
export const aiSdkAgentRuntime: AgentAdapterRuntime<"ai-sdk"> = createAgentAdapterRuntime({
  adapterId: "ai-sdk",
  turn: async ({ model, messages, tools, signal }) => {
    const system = messages.filter((message) => message.role === "system");
    const result = await generateText({
      model: model.model as LanguageModel,
      ...(system.length === 0
        ? {}
        : { system: system.map((message) => message.content).join("\n") }),
      messages: messages.flatMap(modelMessage),
      tools: Object.fromEntries(
        tools.map((definition) => [
          definition.name,
          tool({
            description: definition.description,
            inputSchema: jsonSchema(definition.inputSchema as Parameters<typeof jsonSchema>[0]),
          }),
        ]),
      ),
      abortSignal: signal,
    });
    return {
      text: result.text,
      toolCalls: result.toolCalls.map((call) => ({
        toolCallId: call.toolCallId,
        name: call.toolName,
        input: call.input,
      })),
    };
  },
});

function modelMessage(message: AgentThreadMessage): ModelMessage[] {
  switch (message.role) {
    case "system":
      return [];
    case "user":
      return [{ role: "user", content: message.content }];
    case "tool":
      return [
        {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: message.toolCallId,
              toolName: message.name,
              output: { type: "text", value: message.content },
            },
          ],
        },
      ];
    case "assistant":
      return [
        {
          role: "assistant",
          content: [
            ...(message.content === "" ? [] : [{ type: "text" as const, text: message.content }]),
            ...(message.toolCalls ?? []).map((call) => ({
              type: "tool-call" as const,
              toolCallId: call.toolCallId,
              toolName: call.name,
              input: call.input,
            })),
          ],
        },
      ];
  }
}

import { MockLanguageModelV3 } from "ai/test";
import type {
  TestAgentModel,
  TestAgentModelCall,
  TestAgentModelOptions,
  TestModelTurn,
} from "./agents-types.js";

interface RuntimeTestAgentModel extends TestAgentModel {
  readonly languageModel: unknown;
}

export function createTestModel(
  options: TestAgentModelOptions & { readonly script?: readonly TestModelTurn[] } = {},
): RuntimeTestAgentModel {
  let turns: readonly TestModelTurn[] = [];
  let nextTurn = 0;
  const calls: TestAgentModelCall[] = [];
  const provider = options.provider ?? "test";
  const modelId = options.modelId ?? "default";

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
  const languageModel = new MockLanguageModelV3({
    provider,
    modelId,
    doGenerate: async (request) => {
      if (options.hang === true) return new Promise(() => undefined);
      const turn = turns[nextTurn++];
      if (turn === undefined) throw new Error("Test model script exhausted");
      calls.push(
        Object.freeze({
          index: calls.length,
          request: Object.freeze({
            messages: snapshotPrompt(request.prompt),
            tools: Object.freeze([...(request.tools ?? [])]),
          }),
          turn,
        }),
      );
      return resultFor(turn) as never;
    },
  });

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

function resultFor(turn: TestModelTurn): unknown {
  if (turn.type === "error" || turn.type === "cancelled") {
    throw new Error(turn.type === "error" ? turn.message : (turn.reason ?? "cancelled"));
  }
  return {
    content:
      turn.type === "tool-call"
        ? [
            {
              type: "tool-call",
              toolCallId: turn.callId,
              toolName: turn.toolId,
              input: JSON.stringify(turn.input),
            },
          ]
        : [{ type: "text", text: JSON.stringify(turn.output) }],
    finishReason: { unified: turn.type === "tool-call" ? "tool-calls" : "stop", raw: undefined },
    usage: {
      inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 0, text: 0, reasoning: 0 },
    },
    warnings: [],
  };
}

function snapshotPrompt(prompt: readonly unknown[]): readonly unknown[] {
  return Object.freeze(
    prompt.map((message) => {
      if (!isRecord(message) || message.role !== "tool" || !Array.isArray(message.content)) {
        return message;
      }
      const part = message.content[0];
      if (!isRecord(part) || part.type !== "tool-result") return message;
      return Object.freeze({ role: "tool", content: toolOutput(part.output) });
    }),
  );
}

function toolOutput(value: unknown): unknown {
  if (!isRecord(value)) return value;
  if (value.type === "json" && "value" in value) return value.value;
  if (value.type === "text" && typeof value.value === "string") {
    try {
      return JSON.parse(value.value);
    } catch {
      return value.value;
    }
  }
  if (value.type === "error-text" && typeof value.value === "string") {
    const code = value.value.includes("AI_NoSuchToolError")
      ? "RELKIT_TOOL_NOT_ALLOWED"
      : value.value.includes("AI_InvalidToolInputError")
        ? "RELKIT_TOOL_ARGUMENT_VALIDATION"
        : "RELKIT_TOOL_FAILED";
    return { error: { code, message: "Tool call failed" } };
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

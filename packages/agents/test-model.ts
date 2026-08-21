import { MockLanguageModelV3 } from "ai/test";
import type { JsonValue } from "@zsys/contracts";

export type TestModelTurn =
  | {
      readonly type: "tool-call";
      readonly callId: string;
      readonly toolId: string;
      readonly input: JsonValue;
    }
  | { readonly type: "final"; readonly output: JsonValue };

export function createTestModel(
  turns: readonly TestModelTurn[],
  options: { readonly provider?: string; readonly modelId?: string } = {},
): { readonly model: unknown; readonly calls: readonly unknown[] } {
  let nextTurn = 0;
  const model = new MockLanguageModelV3({
    provider: options.provider ?? "test",
    modelId: options.modelId ?? "default",
    doGenerate: async () => {
      const turn = turns[nextTurn++];
      if (turn === undefined) throw new Error("Test model script exhausted");
      return resultFor(turn) as never;
    },
  });
  const calls = model.doGenerateCalls;
  return { model, calls };
}

export function createHangingTestModel(): {
  readonly model: unknown;
  readonly calls: readonly unknown[];
} {
  const model = new MockLanguageModelV3({
    provider: "test",
    modelId: "default",
    doGenerate: async () => new Promise(() => undefined),
  });
  return { model, calls: model.doGenerateCalls };
}

function resultFor(turn: TestModelTurn): unknown {
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

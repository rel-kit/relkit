/** Runs the shared agent adapter conformance suite against the AI SDK adapter. */
import { createAgentConformanceHarness } from "@relkit/testing/agents-conformance";
import { MockLanguageModelV4 } from "ai/test";
import { describe, test } from "vitest";
import { aiSdk } from "../src/adapter.js";
import { aiSdkAgentRuntime } from "../src/adapter-runtime.js";

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

const harness = createAgentConformanceHarness({
  adapter: () => aiSdk(),
  runtime: aiSdkAgentRuntime,
  scriptedModel: (turns) =>
    new MockLanguageModelV4({
      doGenerate: turns.map((turn) => ({
        content: [
          ...(turn.text === undefined ? [] : [{ type: "text" as const, text: turn.text }]),
          ...(turn.toolCalls ?? []).map((call) => ({
            type: "tool-call" as const,
            toolCallId: call.id,
            toolName: call.name,
            input: JSON.stringify(call.input),
          })),
        ],
        finishReason: { unified: "tool-calls" as const, raw: undefined },
        usage,
        warnings: [],
      })),
    }),
});

describe("AI SDK adapter conformance", () => {
  for (const item of harness.cases) test(item.description, () => harness.run(item.id));
});

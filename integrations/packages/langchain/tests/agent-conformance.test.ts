/** Runs the shared agent adapter conformance suite against the LangChain adapter. */
import { createAgentConformanceHarness } from "@relkit/testing/agents-conformance";
import { FakeToolCallingModel } from "langchain";
import { describe, test } from "vitest";
import { langchain } from "../src/adapter.js";
import { langchainAgentRuntime } from "../src/adapter-runtime.js";

const harness = createAgentConformanceHarness({
  adapter: () => langchain(),
  runtime: langchainAgentRuntime,
  scriptedModel: (turns) =>
    new FakeToolCallingModel({
      toolCalls: turns.map((turn) =>
        (turn.toolCalls ?? []).map((call) => ({
          name: call.name,
          args: call.input as Record<string, unknown>,
          id: call.id,
        })),
      ),
    }),
});

describe("LangChain adapter conformance", () => {
  for (const item of harness.cases) test(item.description, () => harness.run(item.id));
});

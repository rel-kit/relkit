import { createDeepAgent } from "deepagents";
import { toolStrategy } from "langchain";
import type { nestedFixture } from "./deepagent-acceptance-fixtures.ts";

export function directNative(fixture: ReturnType<typeof nestedFixture>) {
  const middle = createDeepAgent({
    name: "manager",
    model: fixture.manager.model,
    systemPrompt: "You are manager.",
    tools: [],
    subagents: [
      {
        name: "researcher",
        description: "researcher",
        model: fixture.researcher.model,
        systemPrompt: "You are researcher.",
        tools: [fixture.lookup],
        responseFormat: outputFormat(),
      },
    ],
    responseFormat: outputFormat(),
  });
  return createDeepAgent({
    name: "parent",
    model: fixture.parent.model,
    systemPrompt: "You are parent.",
    tools: [],
    subagents: [{ name: "manager", description: "manager", runnable: middle }],
    responseFormat: outputFormat(),
  });
}

function outputFormat() {
  return toolStrategy(
    {
      title: "relkit_output",
      type: "object",
      properties: {
        value: {
          type: "object",
          properties: { answer: { type: "string" } },
          required: ["answer"],
          additionalProperties: false,
        },
      },
      required: ["value"],
      additionalProperties: false,
    },
    { handleError: false },
  );
}

import { expect, test } from "vitest";
import { z } from "@relkit/schema";
import { createDeepAgent } from "deepagents";
import { FakeToolCallingModel } from "langchain";
import type { AgentExecutionEvent } from "../src/index.ts";
import { collectNativeEvents } from "../src/runtime-native-events.ts";
import { createTestModel } from "./test-model.ts";
import { native, relkitOutput, sink, stream } from "./native-deep-events.helpers.ts";

test("normalizes real DeepAgents child execution without native payloads", async () => {
  const model = createTestModel([
    {
      type: "tool-call",
      callId: "delegate-1",
      toolId: "task",
      native: true,
      input: { description: "Research", subagent_type: "researcher" },
    },
    { type: "final", output: { answer: "done" } },
  ]);
  const agent = createDeepAgent({
    name: "parent",
    model: model.model,
    systemPrompt: "Delegate once.",
    tools: [],
    subagents: [
      {
        name: "researcher",
        description: "Research facts.",
        model: new FakeToolCallingModel(),
        tools: [],
        systemPrompt: "Answer.",
      },
    ],
    generalPurposeAgent: false,
    responseFormat: relkitOutput(),
  });
  const run = await agent.streamEvents(
    { messages: [{ role: "user", content: "go" }] },
    { version: "v3" },
  );
  const events: AgentExecutionEvent[] = [];
  const tools: Array<{ toolId: string; state: string }> = [];
  await collectNativeEvents(
    run,
    sink(events, tools),
    new Map(),
    new Set(),
    new AbortController().signal,
    { maxSteps: 4, maxToolCalls: 2 },
    new Map(),
    () => undefined,
    undefined,
    (reason) => run.abort(reason),
  );

  expect(await run.output).toMatchObject({ structuredResponse: { value: { answer: "done" } } });
  expect(events.some((event) => event.agent === "researcher" && event.scope.length > 0)).toBe(true);
  expect(
    events.some(
      (event) =>
        event.agent === "researcher" &&
        event.parent?.toolCallId === "delegate-1" &&
        event.kind === "messages",
    ),
  ).toBe(true);
  expect(events.at(-1)).toMatchObject({ agent: "parent", scope: [] });
  expect(events.at(-1)).not.toHaveProperty("parent");
  expect(tools.filter(({ toolId }) => toolId === "task").map(({ state }) => state)).toEqual([
    "started",
    "input-ready",
    "running",
    "succeeded",
  ]);
  expect(JSON.stringify(events)).not.toContain("langchain_core");
  expect(JSON.stringify(events)).not.toContain("lc_agent_name");
});

test("keeps scoped public state isolated and sanitizes failure and human input", async () => {
  const events: AgentExecutionEvent[] = [];
  await collectNativeEvents(
    stream([
      native(0, "tasks", [], {
        id: "child-task",
        name: "SkillsMiddleware.before_agent",
        input: { secret: "prompt" },
        metadata: { lc_agent_name: "researcher", credential: "private" },
      }),
      native(1, "values", ["tools:delegate-task"], {
        todos: ["child"],
        privateMemory: "hidden",
      }),
      native(2, "messages", ["tools:delegate-task", "model_request:one"], {
        event: "message-finish",
        responseMetadata: { apiKey: "hidden" },
        usage: { input_tokens: 2, provider_secret: "hidden" },
      }),
      native(3, "input", ["tools:delegate-task"], { response: "hidden" }),
      native(4, "lifecycle", ["tools:delegate-task"], {
        event: "failed",
        graph_name: "researcher",
        error: "private stack",
      }),
    ]),
    sink(events),
    new Map(),
    new Set(),
    new AbortController().signal,
    { maxSteps: 2, maxToolCalls: 2 },
    new Map([["todos", z.array(z.string())]]),
    () => undefined,
    undefined,
    () => undefined,
  );

  expect(events[0]).toMatchObject({ agent: "researcher", value: { status: "started" } });
  expect(events[1]).toMatchObject({ scope: ["tools:delegate-task"], value: { todos: ["child"] } });
  expect(events[2]?.value).toEqual({
    event: "message-finish",
    usage: { input_tokens: 2 },
  });
  expect(events[3]).not.toHaveProperty("value");
  expect(events[4]?.value).toEqual({ event: "failed", graph_name: "researcher" });
  expect(JSON.stringify(events)).not.toMatch(/private|hidden|credential|responseMetadata/);
});

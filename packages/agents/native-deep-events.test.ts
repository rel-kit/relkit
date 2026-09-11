import { expect, test } from "bun:test";
import type { ProtocolEvent } from "@langchain/langgraph";
import { z } from "@relkit/schema";
import { createDeepAgent } from "deepagents";
import { FakeToolCallingModel, toolStrategy } from "langchain";
import type { BrowserMessage } from "@relkit/contracts";
import type { AgentExecutionEvent, AgentContentSink } from "./src/index.ts";
import { collectNativeEvents } from "./src/runtime-native-events.ts";
import { createTestModel } from "./test-model.ts";

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

test("applies model and tool limits across nested scopes", async () => {
  await expect(
    limitFailure("tasks", "model_request", { maxSteps: 1, maxToolCalls: 2 }),
  ).rejects.toMatchObject({
    code: "RELKIT_AGENT_STEP_LIMIT",
  });
  await expect(
    limitFailure("tools", "read_file", { maxSteps: 2, maxToolCalls: 1 }),
  ).rejects.toMatchObject({
    code: "RELKIT_AGENT_TOOL_LIMIT",
  });
});

test("only exposes declared and validated custom events", async () => {
  const events: AgentExecutionEvent[] = [];
  await collectNativeEvents(
    stream([
      native(0, "provider-debug", [], { apiKey: "hidden" }),
      native(1, "custom", [], { name: "private", data: { token: "hidden" } }),
      native(2, "custom", [], { name: "status", data: { step: 2, secret: "hidden" } }),
    ]),
    sink(events),
    new Map(),
    new Set(),
    new AbortController().signal,
    { maxSteps: 2, maxToolCalls: 2 },
    new Map(),
    () => undefined,
    undefined,
    () => undefined,
    { status: z.object({ step: z.number() }) },
  );

  expect(events.map(({ value }) => value)).toEqual([
    undefined,
    undefined,
    { name: "status", data: { step: 2 } },
  ]);
  expect(JSON.stringify(events)).not.toMatch(/apiKey|token|secret|hidden/);
});

test("projects native text deltas into canonical browser messages", async () => {
  const events: AgentExecutionEvent[] = [];
  const messages: BrowserMessage[] = [];
  await collectNativeEvents(
    stream([
      native(0, "messages", [], { event: "message-start", id: "message-1", role: "ai" }),
      native(1, "messages", [], {
        event: "content-block-start",
        index: 0,
        content: { type: "text", text: "" },
      }),
      native(2, "messages", [], {
        event: "content-block-delta",
        index: 0,
        delta: { type: "text-delta", text: "Hello" },
      }),
      native(3, "messages", [], { event: "message-finish" }),
    ]),
    sink(events, [], messages),
    new Map(),
    new Set(),
    new AbortController().signal,
    { maxSteps: 2, maxToolCalls: 2 },
    new Map(),
    () => undefined,
    undefined,
    () => undefined,
  );

  expect(messages).toEqual([
    expect.objectContaining({
      messageId: "message-1",
      role: "assistant",
      parts: [expect.objectContaining({ text: "Hello", state: "streaming" })],
    }),
    expect.objectContaining({
      messageId: "message-1",
      parts: [expect.objectContaining({ text: "Hello", state: "complete" })],
    }),
  ]);
});

function relkitOutput() {
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

function sink(
  events: AgentExecutionEvent[],
  tools: Array<{ toolId: string; state: string }> = [],
  messages: BrowserMessage[] = [],
): AgentContentSink {
  return {
    emitOutput: () => undefined,
    emitEvent: (event) => events.push(event),
    emitTool: ({ toolId, state }) => tools.push({ toolId, state }),
    emitMessage: (message) => messages.push(message),
  };
}

async function limitFailure(
  method: "tasks" | "tools",
  name: string,
  limits: { maxSteps: number; maxToolCalls: number },
): Promise<void> {
  const data =
    method === "tasks"
      ? { id: "id", name }
      : { event: "tool-started", tool_call_id: "id", tool_name: name };
  await collectNativeEvents(
    stream([native(0, method, [], data), native(1, method, ["tools:child"], data)]),
    undefined,
    new Map(),
    new Set(),
    new AbortController().signal,
    limits,
    new Map(),
    () => undefined,
    undefined,
    () => undefined,
  );
}

async function* stream(events: readonly ProtocolEvent[]): AsyncIterable<ProtocolEvent> {
  yield* events;
}

function native(seq: number, method: string, namespace: string[], data: unknown): ProtocolEvent {
  return {
    type: "event",
    seq,
    method,
    params: { namespace, timestamp: seq, data },
  } as ProtocolEvent;
}

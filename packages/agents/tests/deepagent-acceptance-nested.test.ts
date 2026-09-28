import { expect, test } from "vitest";
import type { AgentExecutionEvent } from "../src/index.ts";
import { invokeAgent } from "../src/index.ts";
import { directNative } from "./deepagent-acceptance-native.ts";
import { nestedFixture } from "./deepagent-acceptance-fixtures.ts";

test("recursively maps deep subagents with isolated scopes and native parity", async () => {
  const relkit = nestedFixture();
  const events: AgentExecutionEvent[] = [];
  const tools: string[] = [];
  const output = await invokeNested(relkit, events, tools);
  const direct = nestedFixture();
  const native = directNative(direct);
  const run = await native.streamEvents(
    { messages: [{ role: "user", content: JSON.stringify({ message: "root-private" }) }] },
    { version: "v3" },
  );
  for await (const _event of run) void _event;
  const nativeOutput = await run.output;

  expect(output).toEqual({ answer: "parent-result" });
  expect(nativeOutput).toMatchObject({ structuredResponse: { value: output } });
  expect(relkit.effects()).toBe(1);
  expect(direct.effects()).toBe(1);
  expect(tools).toContain("lookup:succeeded");
  expect(events.some(({ agent }) => agent === "manager")).toBe(true);
  expect(events.some(({ agent }) => agent === "researcher")).toBe(true);
  expect(JSON.stringify(relkit.manager.calls[0])).toContain("manage-visible");
  expect(JSON.stringify(relkit.manager.calls[0])).not.toContain("root-private");
  expect(JSON.stringify(relkit.researcher.calls[0])).toContain("leaf-visible");
  expect(JSON.stringify(relkit.researcher.calls[0])).not.toContain("manage-visible");
});

async function invokeNested(
  fixture: ReturnType<typeof nestedFixture>,
  events: AgentExecutionEvent[],
  tools: string[],
) {
  return invokeAgent({
    agent: fixture.agent,
    input: { message: "root-private" },
    threadId: "nested:relkit",
    tools: [],
    engine: { invoke: () => Promise.reject(new Error("unexpected RELKIT tool")) },
    contentSink: {
      emitOutput: () => undefined,
      emitEvent: (event) => events.push(event),
      emitTool: ({ toolId, state }) => tools.push(`${toolId}:${state}`),
    },
  });
}

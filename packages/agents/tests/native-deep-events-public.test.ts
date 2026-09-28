import { expect, test } from "vitest";
import { z } from "@relkit/schema";
import type { BrowserMessage } from "@relkit/contracts";
import type { AgentExecutionEvent } from "../src/index.ts";
import { collectNativeEvents } from "../src/runtime-native-events.ts";
import { limitFailure, native, sink, stream } from "./native-deep-events.helpers.ts";

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

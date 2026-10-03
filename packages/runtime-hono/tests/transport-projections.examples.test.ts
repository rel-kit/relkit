import { z } from "@relkit/schema";
import { expect, test } from "vitest";
import { encodeAgentCursor, parseAgentCursor } from "../src/agent-protocol-support.js";
import { toolFrame } from "../src/agent-protocol-tool.js";
import { projectStreamFrame } from "../src/jobs/projection-stream.js";
import { decodeInferredInput } from "../src/request-inference.js";

test("documented journal checkpoint survives Last-Event-ID encoding", () => {
  const checkpoint = {
    applicationId: "app",
    environment: "test",
    profile: "local",
    providerEpoch: "epoch-1",
    threadId: "thread-1",
    sequence: "42",
  };
  const replay = parseAgentCursor(encodeAgentCursor(checkpoint));
  expect(replay).toEqual(checkpoint);
  expect(() => parseAgentCursor("%")).toThrow(TypeError);
});

test("documented tool replay emits only the new input suffix", () => {
  const inputs = new Map<string, string>([["call-1", "hel"]]);
  const frame = toolFrame(
    {
      kind: "tool",
      partId: "part-1",
      toolCallId: "call-1",
      toolId: "search",
      state: "input-streaming",
      inputText: "hello",
    },
    inputs,
  );
  expect(frame.inputDelta).toBe("lo");
  expect(inputs.get("call-1")).toBe("hello");
});

test("documented inferred scalars preserve explicit request mapping", () => {
  const target = { input: z.object({ page: z.number(), active: z.boolean() }) };
  const raw = { page: "2", active: "true" };
  expect(decodeInferredInput(raw, {}, target)).toEqual({ page: 2, active: true });
  expect(decodeInferredInput(raw, { request: {} }, target)).toBe(raw);
});

test("documented stream projection omits private provider fields", () => {
  const frame = projectStreamFrame(
    {
      kind: "chunk",
      runId: "run-1",
      name: "tokens",
      attempt: 1,
      generation: "gen-1",
      schemaVersion: "1",
      sequence: 0,
      item: { text: "hello" },
      privateDebug: "omitted",
    },
    "run-1",
    "tokens",
  );
  expect(frame).not.toHaveProperty("privateDebug");
  expect(Object.isFrozen(frame)).toBe(true);
  expect(() => projectStreamFrame(frame, "other-run", "tokens")).toThrow();
});

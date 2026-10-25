/** Exercises the real native loop with Responses-style JSON output after one tool side effect. */
import { AIMessage } from "@langchain/core/messages";
import { z } from "@relkit/schema";
import { Effect } from "effect";
import { expect, test, vi } from "vitest";
import { ProviderStrategy, ToolStrategy } from "langchain";
import { defineAgent } from "../src/define-agent.js";
import { invokeAgent, invokeAgentFunction } from "../src/runtime.js";
import { responseFormatEffect } from "../src/runtime-native-response-format.js";
import { createNativeStringTool } from "./test-native-tool.js";
import { createTestModel } from "./test-model.js";

/** @param final - The terminal model content. @returns One isolated invocation and observed writes/model calls. */
function fixture(final: string | Error) {
  const writes: string[] = [];
  const tool = createNativeStringTool("write_once", ({ value }) => {
    writes.push(value);
    return JSON.stringify({ value, totalCents: 200 });
  });
  const { model } = createTestModel([
    {
      type: "tool-call",
      callId: "write-1",
      toolId: "write_once",
      native: true,
      input: { value: "owned" },
    },
  ]);
  const responseModel = Object.assign(model, { useResponsesApi: true });
  const generate = model._generate.bind(model);
  const calls = vi
    .spyOn(model, "_generate")
    .mockImplementationOnce(generate)
    .mockImplementation(async () => {
      if (final instanceof Error) throw final;
      return { generations: [{ text: final, message: new AIMessage(final) }] };
    });
  const agent = defineAgent({
    id: "responses.test",
    input: z.object({ question: z.string() }),
    output: z.object({ answer: z.string() }),
    model: responseModel,
    instructions: "Write once, then answer.",
    tools: [tool],
    limits: { maxSteps: 4, maxToolCalls: 4, timeoutMs: 5000 },
  });
  return {
    writes,
    calls,
    options: {
      agent,
      tools: [],
      engine: { invoke: async () => null },
      input: { question: "Write once" },
    },
  };
}

test("Responses clients use native schema output without rerunning successful tools", async () => {
  const run = fixture(JSON.stringify({ value: { answer: "owned: 200" } }));
  await expect(invokeAgent(run.options)).resolves.toEqual({ answer: "owned: 200" });
  expect(run.writes).toEqual(["owned"]);
  expect(run.calls).toHaveBeenCalledTimes(2);
});

test("invalid native output stays a validation failure and never replays a write", async () => {
  const run = fixture("plain text is not structured output");
  await expect(invokeAgent(run.options)).rejects.toMatchObject({
    code: "RELKIT_AGENT_OUTPUT_VALIDATION",
  });
  expect(run.writes).toEqual(["owned"]);
  expect(run.calls).toHaveBeenCalledTimes(2);
});

test("non-Responses models retain the tool strategy and disabled validation retries", () => {
  const schema = z.object({ answer: z.string() });
  const ordinary = Effect.runSync(responseFormatEffect(schema));
  if (!Array.isArray(ordinary)) throw new Error("Expected tool strategy");
  expect(ordinary[0]).toBeInstanceOf(ToolStrategy);
  expect(ordinary[0]?.options?.handleError).toBe(false);
  const model = Object.assign(createTestModel([]).model, { useResponsesApi: true });
  expect(Effect.runSync(responseFormatEffect(schema, model))).toBeInstanceOf(ProviderStrategy);
});

test("generated actions retain a safe output error and warn that tools may have completed", async () => {
  const run = fixture("private-invalid-model-content");
  await expect(invokeAgentFunction(run.options)).rejects.toMatchObject({
    code: "RELKIT_AGENT_OUTPUT_VALIDATION",
    message:
      "Agent output validation failed. Tool actions may have completed; check their results before retrying.",
  });
  expect(run.writes).toEqual(["owned"]);
  expect(run.calls).toHaveBeenCalledTimes(2);
});

test("model failure after a successful tool retains private provenance without replay", async () => {
  const cause = Object.assign(new Error("private-provider-payload"), { status: 503 });
  const run = fixture(cause);
  await expect(invokeAgentFunction(run.options)).rejects.toMatchObject({
    code: "RELKIT_AGENT_MODEL_ERROR",
    message: "Model response was invalid or unavailable",
    cause,
  });
  expect(run.writes).toEqual(["owned"]);
  expect(run.calls).toHaveBeenCalledTimes(2);
});

test("rejects the malformed Luna journal output without repeating its successful tool", async () => {
  const run = fixture('{"title":"relkit_output","value":{"answer":"Hello, Validation!"}}');
  await expect(invokeAgent(run.options)).rejects.toMatchObject({
    code: "RELKIT_AGENT_OUTPUT_VALIDATION",
  });
  expect(run.writes).toEqual(["owned"]);
  expect(run.calls).toHaveBeenCalledTimes(2);
});

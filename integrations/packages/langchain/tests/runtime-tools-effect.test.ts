/** Exercises native runtime tools effect behavior through the integration owner, preserving the original assertions and scoped test fixtures. */

import { Effect } from "effect";
import { expect, test } from "vitest";
import { defineFunction } from "@relkit/functions";
import { z } from "@relkit/schema";
import { defineTool } from "@relkit/tools";
import { defineAgent } from "../src/define-agent.js";
import {
  findModelToolEffect,
  findToolEffect,
  modelToolNameEffect,
  runToolEffect,
} from "../src/runtime-tools.js";

test("tool lookup Effects preserve native names and registered IDs", () => {
  const tool = { id: "orders.lookup", target: {} } as never;
  const source = new Map([["alias", tool]]);
  expect(Effect.runSync(modelToolNameEffect("orders.lookup", 0))).toBe("orders_lookup_0");
  expect(Effect.runSync(findToolEffect(source, "orders.lookup"))).toBe(tool);
  expect(
    Effect.runSync(
      findModelToolEffect(source, [{ ref: { id: "orders.lookup" } }], "orders_lookup_0"),
    ),
  ).toBe(tool);
});

test("tool execution Effect returns a safe error for an unlisted tool", async () => {
  const options = { agent: { tools: [] }, tools: [], engine: {} } as never;
  const result = await Effect.runPromise(
    runToolEffect(
      options,
      { callId: "one", toolId: "unknown", input: {} },
      new AbortController().signal,
      1024,
      "invoke",
    ),
  );
  expect(result).toEqual({
    error: { code: "RELKIT_TOOL_NOT_ALLOWED", message: "Tool call failed" },
  });
});

test("tool execution Effect validates and invokes an allowed tool", async () => {
  const { options, call } = allowedToolRunFixture();
  expect(
    await Effect.runPromise(
      runToolEffect(options, call, new AbortController().signal, 1024, "invoke"),
    ),
  ).toEqual({ state: "ready" });
  expect(
    await Effect.runPromise(
      runToolEffect(
        {
          ...options,
          engine: {
            invoke: async () => {
              throw new Error("provider failed");
            },
          },
        },
        call,
        new AbortController().signal,
        1024,
        "invoke",
      ),
    ),
  ).toEqual({ error: { code: "RELKIT_TOOL_FAILED", message: "Tool call failed" } });
  expect(
    await Effect.runPromise(
      runToolEffect(
        { ...options, engine: { invoke: async () => ({ state: "a".repeat(200) }) } },
        call,
        new AbortController().signal,
        20,
        "invoke",
      ),
    ),
  ).toEqual({
    error: { code: "RELKIT_AGENT_RESPONSE_LIMIT", message: "Tool call failed" },
  });
});

/** Constructs the native allowed tool fixture once for its owning case, preserving callback and resource identity.
 * @returns The unchanged native descriptors and directly observed fixture values.
 */
function allowedToolFixture() {
  const target = defineFunction({
    id: "orders.lookup",
    input: z.object({ id: z.string() }),
    output: z.object({ state: z.string() }),
    handler: async ({ id }) => ({ state: id }),
  });
  const tool = defineTool({
    id: "orders.lookup.tool",
    target,
    description: "Look up order",
    sideEffect: "read",
    approval: "never",
  });
  return tool;
}

/** Constructs the native allowed tool run fixture once for its owning case, preserving callback and resource identity.
 * @returns The unchanged native descriptors and directly observed fixture values.
 */
function allowedToolRunFixture() {
  const tool = allowedToolFixture();
  const options = {
    agent: defineAgent({
      id: "allowed.tool.fixture",
      input: z.object({ prompt: z.string() }),
      output: z.object({ answer: z.string() }),
      instructions: "Use the selected tool.",
      tools: [tool],
      limits: { maxSteps: 1, maxToolCalls: 1, timeoutMs: 1000 },
    }),
    input: { prompt: "lookup" },
    tools: [tool],
    engine: { invoke: async () => ({ state: "ready" }) },
  };
  const call = { callId: "one", toolId: tool.id, input: { id: "known" } };
  return { options, call };
}

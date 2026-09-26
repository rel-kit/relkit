import { expect, test } from "vitest";
import { z } from "@relkit/schema";
import { defineFunction } from "../src/define-function.js";
import { createFunctionTool } from "../src/function-tool.js";

test("on-write approval and tool hooks transform the dispatched value", async () => {
  const stages: string[] = [];
  const target = defineFunction({
    id: "orders.lookup",
    input: z.object({ id: z.string() }),
    output: z.object({ id: z.string() }),
    handler: ({ id }) => {
      stages.push(`handler:${id}`);
      return { id };
    },
  });
  const tool = createFunctionTool({
    id: "orders.lookup-tool",
    target,
    description: "Lookup order",
    sideEffect: "write",
    approval: "on-write",
    timeoutMs: 1_000,
    onBefore: (value) => {
      stages.push("before");
      return { id: `${value.id}-before` };
    },
    onAfter: (value) => {
      stages.push("after");
      return { id: `${value.id}-after` };
    },
  });
  let approvals = 0;
  await expect(
    tool.invoke(
      { id: "one" },
      {
        approval: () => {
          approvals += 1;
          return true;
        },
      },
    ),
  ).resolves.toEqual({ id: "one-before-after" });
  expect(approvals).toBe(1);
  expect(stages).toEqual(["before", "handler:one-before", "after"]);
});

test("on-write policy lets read-only tools run without approval", async () => {
  const target = defineFunction({
    id: "orders.lookup",
    input: z.object({ id: z.string() }),
    output: z.object({ id: z.string() }),
    handler: ({ id }) => ({ id }),
  });
  const tool = createFunctionTool({
    id: "orders.lookup-tool",
    target,
    description: "Lookup order",
    sideEffect: "read",
    approval: "on-write",
  });
  await expect(tool.invoke({ id: "one" })).resolves.toEqual({ id: "one" });
});

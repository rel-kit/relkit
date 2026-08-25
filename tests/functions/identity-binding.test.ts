import { expect, test } from "bun:test";
import { bindDescriptorIdentity } from "../../packages/invocation/dist/index.js";
import { invokeFunction } from "../../packages/engine/src/index.ts";
import { defineError, defineFunction } from "../../packages/functions/src/index.ts";
import { z } from "../../packages/schema/src/index.ts";
import { resolveToolTarget } from "../../packages/tools/src/runtime.ts";

test("bound inferred errors create canonical instances and engine records", async () => {
  const error = defineError({
    data: z.object({ reason: z.string() }),
    message: "Invalid",
    retry: "never",
  });
  const target = defineFunction({
    input: z.object({ value: z.string() }),
    output: z.object({ ok: z.boolean() }),
    errors: [error],
    handler: () => {
      throw error.create({ reason: "bad" });
    },
  });
  bindDescriptorIdentity(error, "orders.InvalidError");
  bindDescriptorIdentity(target, "orders.get-order");

  expect(error.create({ reason: "bad" })).toMatchObject({
    id: "orders.InvalidError",
    ref: { id: "orders.InvalidError" },
  });
  const records: string[] = [];
  await expect(
    invokeFunction(
      target,
      { value: "x" },
      {
        hooks: { onInvocationStart: (record) => records.push(record.functionId) },
      },
    ),
  ).rejects.toMatchObject({ id: "orders.InvalidError" });
  expect(records).toEqual(["orders.get-order"]);
});

test("bound tool views resolve canonical targets and approval IDs", async () => {
  const target = defineFunction({
    input: z.object({ value: z.string() }),
    output: z.object({ ok: z.boolean() }),
    handler: () => ({ ok: true }),
  });
  const tool = target.asTool({
    description: "Update an order",
    sideEffect: "write",
    approval: "on-write",
  });
  bindDescriptorIdentity(target, "orders.update-order");
  bindDescriptorIdentity(tool, "orders.update-order.tool");
  bindDescriptorIdentity(tool.target, "orders.update-order");

  expect(resolveToolTarget(tool).functionId).toBe("orders.update-order");
  let approvalId = "";
  await expect(
    tool.invoke(
      { value: "x" },
      {
        approval: (approval) => {
          approvalId = approval.toolId;
          return "approved";
        },
      },
    ),
  ).resolves.toEqual({ ok: true });
  expect(approvalId).toBe("orders.update-order.tool");
});

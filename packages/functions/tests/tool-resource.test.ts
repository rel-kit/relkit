import { expect, test } from "vitest";
import { z } from "@relkit/schema";
import { defineFunction } from "../src/define-function.js";
import { createFunctionTool } from "../src/function-tool.js";

test("a synchronous abort during listener registration releases it without starting approval", async () => {
  let started = 0;
  let approvals = 0;
  let removed = 0;
  let aborted = false;
  const signal = {
    get aborted() {
      return aborted;
    },
    reason: new DOMException("cancelled", "AbortError"),
    addEventListener(_type: string, listener: EventListenerOrEventListenerObject) {
      aborted = true;
      if (typeof listener === "function") listener(new Event("abort"));
      else listener.handleEvent(new Event("abort"));
    },
    removeEventListener() {
      removed += 1;
    },
  } as unknown as AbortSignal;
  const target = defineFunction({
    id: "orders.lookup",
    input: z.object({ id: z.string() }),
    output: z.object({ id: z.string() }),
    handler: ({ id }) => {
      started += 1;
      return { id };
    },
  });
  const tool = createFunctionTool({
    id: "orders.lookup-tool",
    target,
    description: "Lookup order",
    sideEffect: "read",
    approval: "always",
  });
  await expect(
    tool.invoke(
      { id: "one" },
      {
        signal,
        approval: () => {
          approvals += 1;
          return true;
        },
      },
    ),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(removed).toBe(1);
  expect(approvals).toBe(0);
  expect(started).toBe(0);
});

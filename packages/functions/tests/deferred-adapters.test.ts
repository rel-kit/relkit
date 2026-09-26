import { expect, test } from "vitest";
import { z } from "@relkit/schema";
import { defineFunction } from "../src/define-function.js";
import { createFunctionGraphNode } from "../src/function-graph-node.js";
import { createFunctionToolInvoker } from "../src/function-tool-runtime.js";

test("direct Promise invoker and graph node adapters use the default runtime", async () => {
  const target = defineFunction({
    id: "orders.lookup",
    input: z.object({ id: z.string() }),
    output: z.object({ id: z.string() }),
    handler: ({ id }) => ({ id: `handler:${id}` }),
  });
  const invoke = createFunctionToolInvoker(target, {
    id: "orders.lookup-tool",
    sideEffect: "read",
    approval: "never",
  });
  const node = createFunctionGraphNode(target, target);

  await expect(invoke({ id: "one" })).resolves.toEqual({ id: "handler:one" });
  await expect(node.invoke({ id: "two" })).resolves.toEqual({ id: "handler:two" });
});

import { expect, test } from "bun:test";
import { GraphInterruptedError, invokeAgent } from "@relkit/app/agents";
import deepAgent from "@app/orders/agents/order-deep.agent.js";
import orderReview from "@app/orders/agents/order-review.agent.js";
import supportAgent from "@app/orders/agents/order-support.agent.js";
import cancelOrder from "@app/orders/tools/cancel-order.tool.js";
import lookupOrder from "@app/orders/tools/lookup-order.tool.js";
import { orderCheckpoints, orderMemory } from "@app/orders/agents/order-agent-persistence.js";

const unusedEngine = { invoke: () => Promise.reject(new Error("Unexpected RELKIT tool.")) };

test("native support agent executes mixed tools and publishes todo state", async () => {
  const values: unknown[] = [];
  await expect(
    invokeAgent({
      agent: supportAgent,
      input: { message: "Where is demo-1?" },
      threadId: "example:support",
      tools: [lookupOrder, cancelOrder],
      engine: unusedEngine,
      contentSink: {
        emitOutput: () => undefined,
        emitEvent: (event) => {
          if (event.kind === "values") values.push(event.value);
        },
      },
    }),
  ).resolves.toEqual({ answer: "Order demo-1 is ready." });
  expect(supportAgent.tools.map((entry) => ("ref" in entry ? entry.ref.id : entry.name))).toEqual([
    "orders.lookup-order",
    "orders.cancel-order",
    "order_status",
  ]);
  expect(values).toContainEqual({
    todos: [
      { content: "Find the order", status: "completed" },
      { content: "Explain its state", status: "completed" },
    ],
  });
});

test("DeepAgent executes with inherited subagent, skills, memory, and bucket backend", async () => {
  expect(deepAgent.subagents).toMatchObject([
    { id: "inventory-specialist", tools: [{ ref: { id: "orders.lookup-order" } }] },
  ]);
  expect(deepAgent.subagents?.[0]).not.toHaveProperty("model");
  expect(deepAgent.skills).toEqual(["/skills/commerce/"]);
  expect(deepAgent.memory).toEqual(["/AGENTS.md"]);
  expect(deepAgent.backend).toMatchObject({
    ref: { kind: "bucket", id: "orders.agent-workspace" },
  });
  expect(deepAgent.checkpointer).toBe(orderCheckpoints);
  expect(deepAgent.store).toBe(orderMemory);
  await expect(
    invokeAgent({
      agent: deepAgent,
      input: { message: "Delegate inventory." },
      threadId: "example:deep",
      bucketBackend: emptyBucket,
      tools: [lookupOrder],
      engine: unusedEngine,
    }),
  ).resolves.toEqual({ answer: "The inventory specialist confirmed availability." });
});

test("order graph runs parallel work, loops, interrupts, and resumes", async () => {
  expect(orderReview.workflow.edges).toEqual(
    expect.arrayContaining([
      { kind: "edge", from: "__start__", to: "load-inventory" },
      { kind: "edge", from: "__start__", to: "assess-risk" },
      { kind: "join", from: ["load-inventory", "assess-risk"], to: "retry" },
      {
        kind: "conditional",
        from: "retry",
        routes: [
          { label: "again", to: "retry" },
          { label: "ready", to: "review" },
        ],
        dynamic: false,
      },
    ]),
  );
  let waiting: GraphInterruptedError | undefined;
  try {
    await invokeAgent({
      agent: orderReview,
      input: { orderId: "demo-1" },
      threadId: "example:review",
      tools: {},
      engine: unusedEngine,
    });
  } catch (error) {
    if (error instanceof GraphInterruptedError) waiting = error;
    else throw error;
  }
  expect(waiting?.interrupts).toMatchObject([{ node: "review", response: { type: "boolean" } }]);
  await expect(
    invokeAgent({
      agent: orderReview,
      input: false,
      threadId: "example:review",
      resume: true,
      tools: {},
      engine: unusedEngine,
    }),
  ).resolves.toEqual({ result: "rejected" });
  const saver = await orderCheckpoints.acquire({ env: {} });
  await expect(
    saver.getTuple({ configurable: { thread_id: "example:review" } }),
  ).resolves.toBeDefined();
});

const emptyBucket = {
  put: async () => undefined,
  get: async () => undefined,
  head: async () => undefined,
  delete: async () => undefined,
  exists: async () => false,
  list: async () => [],
};

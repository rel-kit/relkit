/** Exercises maintained grouped commerce sources through the native acceptance boundary. */
import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import orderSupport from "../../../examples/commerce/src/services/orders/agents/order-support.agent.ts";
import getOrderTool from "../../../examples/commerce/src/services/orders/tools/lookup-order.tool.ts";
import cancelOrderTool from "../../../examples/commerce/src/services/orders/tools/cancel-order.tool.ts";
import { createTestAgent } from "../../../packages/testing/src/index.ts";

describe("commerce-example support agent", () => {
  test("runs its native model with an explicit persistent thread without storing content", () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const agent = yield* Effect.acquireRelease(
            Effect.sync(() =>
              createTestAgent({
                agent: orderSupport,
                tools: [getOrderTool, cancelOrderTool],
                engine: {
                  invoke: () => Promise.reject(new Error("Unexpected RELKIT tool invocation.")),
                },
              }),
            ),
            (owner) => Effect.promise(() => owner.close()),
          );

          yield* Effect.tryPromise(async () =>
            expect(
              agent.invoke({ message: "raw-prompt-secret" }, { threadId: "commerce-support-test" }),
            ).resolves.toEqual({ answer: "Order demo-1 is ready." }),
          );

          expect(typeof orderSupport.model).toBe("object");
          expect(getOrderTool.id).toBe("orders.lookup-order");
          expect(agent.model.calls).toHaveLength(0);

          const trace = agent.trace.read();
          const agentSpan = trace.spans.find(
            (span) => span.name.endsWith(".invoke") && span.status === "started",
          );
          const modelSpans = trace.spans.filter(
            (span) => span.name.endsWith(".model") && span.status === "started",
          );
          expect(agentSpan?.functionId).toBe(`relkit.agent.${orderSupport.id}.invoke`);
          expect(modelSpans.map((span) => span.parentSpanId)).toEqual([agentSpan?.spanId]);
          expect(trace.edges).toEqual(
            expect.arrayContaining([
              {
                relationship: "uses-provider-profile",
                from: orderSupport.id,
                to: "native:CommerceModel",
              },
            ]),
          );

          const serializedTrace = JSON.stringify(trace);
          expect(trace.spans.every((span) => span.capture === undefined)).toBe(true);
          expect(serializedTrace).not.toContain("raw-prompt-secret");
        }),
      ),
    ));
});

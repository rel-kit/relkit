import { describe, expect, test } from "bun:test";
import {
  createGeneratedAgentFunction,
  generatedAgentFunctionId,
  isGeneratedAgentFunction,
} from "./src/generated-function.ts";

describe("generated agent functions", () => {
  test("keep one stable marked handler and executor", async () => {
    const calls: unknown[] = [];
    const handler = createGeneratedAgentFunction("support.order", (input, request, context) => {
      calls.push(input, request, context);
      return { ok: true };
    });

    expect(generatedAgentFunctionId(" support.order ")).toBe("zsys.agent.support.order.invoke");
    expect(isGeneratedAgentFunction(handler)).toBe(true);
    expect(handler.functionId).toBe("zsys.agent.support.order.invoke");
    expect(Object.isFrozen(handler)).toBe(true);
    const request = { url: "http://zsys.test" };
    const context = { invocationId: "invocation-1" };
    expect(await handler({ id: "order-1" }, request, context)).toEqual({ ok: true });
    expect(calls).toEqual([{ id: "order-1" }, request, context]);
  });
});

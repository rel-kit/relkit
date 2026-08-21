import { describe, expect, test } from "bun:test";
import { z } from "../../packages/schema/src/index.ts";
import {
  isToolDescriptor,
  ToolApprovalDeniedError,
  ToolApprovalRequiredError,
  ToolArgumentValidationError,
  defineTool,
} from "../../packages/tools/src/index.ts";
import { defineError, defineFunction } from "../../packages/functions/src/index.ts";

const input = z.object({ id: z.string() });
const output = z.object({ ok: z.boolean() });

describe("function tool views", () => {
  test("requires metadata for zero-argument views and infers or accepts identity", () => {
    const target = defineFunction({
      id: "orders.lookup",
      input,
      output,
      handler: async () => ({ ok: true }),
    });

    expect(() => target.asTool()).toThrow("complete tool metadata");

    const inferred = target.asTool({
      description: "Look up an order",
      sideEffect: "read",
      approval: "never",
    });
    expect(inferred.id).toBe("orders.lookup.tool");
    expect(inferred.target.ref).toEqual(target.ref);
    expect(inferred.target.input).toBe(target.input);
    expect(inferred.target.output).toBe(target.output);
    expect(Object.prototype.hasOwnProperty.call(inferred.target, "handler")).toBe(false);
    expect(isToolDescriptor(inferred)).toBe(true);

    const explicit = target.asTool({
      id: "support.lookup",
      description: "Look up an order",
      sideEffect: "read",
      approval: "never",
    });
    expect(explicit.id).toBe("support.lookup");
  });

  test("uses complete function metadata for zero-argument views", () => {
    const target = defineFunction({
      id: "orders.read",
      input,
      output,
      tool: { description: "Read an order", sideEffect: "read", approval: "never" },
      handler: async () => ({ ok: true }),
    });

    const tool = target.asTool();
    expect(tool.id).toBe("orders.read.tool");
    expect(tool.description).toBe("Read an order");
    expect(Object.isFrozen(target.tool)).toBe(true);
    expect(Object.getOwnPropertyDescriptor(target, "asTool")).toMatchObject({
      enumerable: false,
      writable: false,
      configurable: false,
    });
  });

  test("invokes through the common engine with tool source and inherited validation", async () => {
    const sources: string[] = [];
    const target = defineFunction({
      id: "orders.invoke",
      input,
      output,
      handler: async (_input, _request, context) => {
        sources.push(context.invocation.source);
        return { ok: true };
      },
    });
    const tool = defineTool({
      id: "orders.invoke.tool",
      target,
      description: "Invoke an order function",
      sideEffect: "read",
      approval: "never",
    });

    await expect(tool.invoke({ id: "order-1" })).resolves.toEqual({ ok: true });
    expect(sources).toEqual(["tool"]);
    expect(Object.isFrozen(tool)).toBe(true);
    expect(Object.getOwnPropertyDescriptor(tool, "invoke")).toMatchObject({
      enumerable: false,
      writable: false,
      configurable: false,
    });
  });

  test("does not retry retryable failures for direct or tool invocation", async () => {
    const retryable = defineError({
      id: "orders.retryable",
      data: z.object({}),
      message: "Try again",
      retry: { kind: "later", afterMs: 100 },
    });
    let executions = 0;
    const target = defineFunction({
      id: "orders.no-auto-retry",
      input,
      output,
      errors: [retryable],
      handler: async () => {
        executions += 1;
        throw retryable.create({});
      },
    });
    const tool = target.asTool({
      description: "Retryable order operation",
      sideEffect: "read",
      approval: "never",
    });

    await expect(target.invoke({ id: "order-1" })).rejects.toMatchObject({
      kind: "application",
      code: "orders.retryable",
      retry: "later",
      afterMs: 100,
    });
    await expect(tool.invoke({ id: "order-1" })).rejects.toMatchObject({
      kind: "application",
      code: "orders.retryable",
      retry: "later",
      afterMs: 100,
    });
    expect(executions).toBe(2);
  });

  test("validates before approval and fails closed when approval is required", async () => {
    let approvals = 0;
    let executions = 0;
    const target = defineFunction({
      id: "orders.approval",
      input,
      output,
      handler: async () => {
        executions += 1;
        return { ok: true };
      },
    });
    const tool = defineTool({
      id: "orders.approval.tool",
      target,
      description: "Update an order",
      sideEffect: "write",
      approval: "on-write",
    });
    const approve = () => {
      approvals += 1;
      return "approved" as const;
    };

    await expect(
      tool.invoke({ id: 7 } as unknown as { id: string }, { approval: approve }),
    ).rejects.toBeInstanceOf(ToolArgumentValidationError);
    expect(approvals).toBe(0);
    expect(executions).toBe(0);

    await expect(tool.invoke({ id: "order-1" })).rejects.toBeInstanceOf(ToolApprovalRequiredError);
    await expect(
      tool.invoke({ id: "order-1" }, { approval: () => "denied" }),
    ).rejects.toBeInstanceOf(ToolApprovalDeniedError);
    await expect(tool.invoke({ id: "order-1" }, { approval: approve })).resolves.toEqual({
      ok: true,
    });
    expect(approvals).toBe(1);
    expect(executions).toBe(1);
  });

  test("applies the tool timeout", async () => {
    const target = defineFunction({
      id: "orders.slow",
      input,
      output,
      handler: async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { ok: true };
      },
    });
    const tool = defineTool({
      id: "orders.slow.tool",
      target,
      description: "Slow order operation",
      sideEffect: "read",
      approval: "never",
      timeoutMs: 5,
    });

    await expect(tool.invoke({ id: "order-1" })).rejects.toMatchObject({ code: "ZSYS_TIMEOUT" });
  });
});

import { describe, expect, test } from "bun:test";
import type { ProtocolId } from "@relkit/contracts";
import { dispatchInvocation } from "@relkit/invocation";
import { z } from "@relkit/schema";
import { InvocationValidationError, invokeFunction, type InvocationTarget } from "./src/index.ts";
const valueInput = z.object({ value: z.number() });
const valueOutput = z.object({ value: z.number() });

function ids() {
  let next = 0;
  return {
    next: (kind: "trace" | "invocation" | "span") =>
      (kind === "trace"
        ? "10000000000000000000000000000001"
        : kind === "span"
          ? (++next).toString(16).padStart(16, "0")
          : `invocation-${++next}`) as ProtocolId,
  };
}

describe("direct child descriptor invocation", () => {
  test("invokes a child with independent identity and inherited trace state", async () => {
    const records: Array<Record<string, unknown>> = [];
    const spans: Array<Record<string, unknown>> = [];
    const now = Date.now();
    let childSignal: AbortSignal | undefined;
    const child: InvocationTarget = {
      id: "orders.child",
      input: valueInput,
      output: valueOutput,
      timeoutMs: 900,
      handler: (input, context) => {
        childSignal = context.signal;
        return { value: (input as { value: number }).value + 1 };
      },
    };
    const parent: InvocationTarget = {
      id: "orders.parent",
      input: valueInput,
      output: valueOutput,
      handler: async (input) => {
        const result = await dispatchInvocation({ target: child, input });
        return result as { value: number };
      },
    };

    const result = await invokeFunction(
      parent,
      { value: 2 },
      {
        idSource: ids(),
        correlationId: "request-1",
        now: () => now,
        timeoutMs: 500,
        hooks: {
          onInvocationStart: (record) => records.push(record),
          onSpanStart: (span) => spans.push(span),
        },
      },
    );

    expect(result).toEqual({ value: 3 });
    expect(records).toHaveLength(2);
    const root = records.find((record) => record.functionId === "orders.parent");
    const childRecord = records.find((record) => record.functionId === "orders.child");
    expect(root).toMatchObject({
      source: "direct",
      traceId: "10000000000000000000000000000001",
      correlationId: "request-1",
    });
    expect(childRecord).toMatchObject({
      source: "direct",
      parentId: root?.id,
      traceId: root?.traceId,
      correlationId: root?.correlationId,
      deadline: root?.deadline,
    });
    expect(childRecord?.id).not.toBe(root?.id);
    const rootSpan = spans.find((span) => span.functionId === "orders.parent");
    const childSpan = spans.find((span) => span.functionId === "orders.child");
    expect(childSpan).toMatchObject({
      traceId: rootSpan?.traceId,
      parentSpanId: rootSpan?.spanId,
    });
    expect(childSignal?.aborted).toBe(false);
  });

  test("validates child input and output at the child boundary", async () => {
    const outcomes: Array<{ functionId: string; outcome: string }> = [];
    const inputChild: InvocationTarget = {
      id: "orders.input-child",
      input: z.number(),
      output: valueOutput,
      handler: () => {
        throw new Error("input child must not run");
      },
    };
    const outputChild: InvocationTarget = {
      id: "orders.output-child",
      input: z.number(),
      output: valueOutput,
      handler: () => ({ value: "invalid" }),
    };
    const invokeFromParent = async (child: InvocationTarget, input: unknown) => {
      const parent: InvocationTarget = {
        id: `orders.parent-${child.id}`,
        input: z.object({}),
        output: z.object({ ok: z.boolean() }),
        handler: async (_value) => {
          try {
            await dispatchInvocation({ target: child, input });
          } catch (error) {
            expect(
              error instanceof InvocationValidationError || (error as { kind?: string }).kind,
            ).toBeTruthy();
          }
          return { ok: true };
        },
      };
      return invokeFunction(
        parent,
        {},
        {
          idSource: ids(),
          hooks: {
            onCompletion: (event) =>
              outcomes.push({ functionId: event.record.functionId, outcome: event.outcome }),
          },
        },
      );
    };

    await invokeFromParent(inputChild, "invalid");
    await invokeFromParent(outputChild, 1);
    expect(outcomes).toContainEqual({
      functionId: "orders.input-child",
      outcome: "validation-error",
    });
    expect(outcomes).toContainEqual({ functionId: "orders.output-child", outcome: "defect" });
  });

  test("propagates parent cancellation to an in-flight child", async () => {
    const controller = new AbortController();
    let childAborted = false;
    let childStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      childStarted = resolve;
    });
    const child: InvocationTarget = {
      id: "orders.wait-child",
      input: z.object({}),
      output: z.object({ ok: z.literal(true) }),
      handler: (_input, context) =>
        new Promise((_resolve, reject) => {
          childStarted();
          context.signal.addEventListener("abort", () => {
            childAborted = true;
            reject(context.signal.reason);
          });
        }),
    };
    const parent: InvocationTarget = {
      id: "orders.wait-parent",
      input: z.object({}),
      output: z.object({ ok: z.literal(true) }),
      handler: (_input) => dispatchInvocation({ target: child, input: {} }),
    };
    const execution = invokeFunction(
      parent,
      {},
      {
        signal: controller.signal,
        idSource: ids(),
      },
    );

    await started;
    controller.abort(new Error("cancelled"));
    await expect(execution).rejects.toMatchObject({ kind: "cancellation" });
    expect(childAborted).toBe(true);
  });
});

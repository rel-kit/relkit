import { describe, expect, test } from "bun:test";
import type { ProtocolId } from "@relkit/contracts";
import { Effect } from "effect";
import { defineError, defineFunction, fail } from "@relkit/app";
import { z } from "@relkit/schema";
import { InvocationValidationError, invokeFunction, type InvocationTarget } from "./src/invoke.ts";

const ids = () => {
  let next = 0;
  return { next: (kind: "trace" | "invocation" | "span") => `${kind}-${++next}` as ProtocolId };
};

function target(
  handler: InvocationTarget["handler"],
  overrides: Partial<InvocationTarget> = {},
): InvocationTarget {
  return {
    id: "orders.get",
    input: z.object({ value: z.number() }),
    output: z.object({ value: z.number() }),
    handler,
    ...overrides,
  };
}

describe("function invocation pipeline", () => {
  test("passes only validated input and execution context to handlers", async () => {
    let seen: unknown;
    await invokeFunction(
      target((_input, context) => {
        seen = context;
        return { value: 1 };
      }),
      { value: 1 },
    );

    expect(seen).toMatchObject({ signal: expect.any(AbortSignal) });
    expect((seen as Record<string, unknown>).request).toBeUndefined();
  });

  test("validates, traces, and releases a successful invocation", async () => {
    const events: string[] = [];
    const now = Date.now();
    const result = await invokeFunction(
      target((input, context) => {
        expect(context.invocation.source).toBe("direct");
        expect(context.signal.aborted).toBe(false);
        return { value: (input as { value: number }).value + 1 };
      }),
      { value: 2 },
      {
        idSource: ids(),
        now: () => now,
        timeoutMs: 500,
        hooks: {
          onInvocationStart: () => events.push("start"),
          onSpanStart: () => events.push("span-start"),
          onSpanComplete: () => events.push("span-complete"),
          onCompletion: (event) => {
            events.push(`complete:${event.outcome}`);
            expect(event.record.deadline).toBe(new Date(now + 500).toISOString());
          },
          onRelease: (event) => events.push(`release:${event.admitted}`),
        },
      },
    );

    expect(result).toEqual({ value: 3 });
    expect(events).toEqual([
      "start",
      "span-start",
      "span-complete",
      "complete:success",
      "release:true",
    ]);
  });

  test("validates transformations and runs after hooks only on success", async () => {
    const events: string[] = [];
    const transformed = defineFunction({
      id: "orders.hooks",
      input: z.object({ value: z.number() }),
      output: z.object({ value: z.number() }),
      onBefore: (input, context) => {
        events.push(`before:${context.invocation.source}`);
        return { value: input.value + 1 };
      },
      handler: (input) => {
        events.push(`handler:${input.value}`);
        return { value: input.value + 1 };
      },
      onAfter: (output) => {
        events.push(`after:${output.value}`);
        return { value: output.value + 1 };
      },
    });

    await expect(invokeFunction(transformed, { value: 1 })).resolves.toEqual({ value: 4 });
    expect(events).toEqual(["before:direct", "handler:2", "after:3"]);

    let after = false;
    const failed = defineFunction({
      id: "orders.failed-hooks",
      input: z.object({ value: z.number() }),
      output: z.object({ value: z.number() }),
      handler: () => {
        throw new Error("failed");
      },
      onAfter: (output) => {
        after = true;
        return output;
      },
    });
    await expect(invokeFunction(failed, { value: 1 })).rejects.toMatchObject({ kind: "defect" });
    expect(after).toBe(false);

    let invalidHandler = false;
    const invalid = defineFunction({
      id: "orders.invalid-hook",
      input: z.object({ value: z.number() }),
      output: z.object({ value: z.number() }),
      onBefore: () => ({ value: "invalid" }) as never,
      handler: (input) => {
        invalidHandler = true;
        return input;
      },
    });
    await expect(invokeFunction(invalid, { value: 1 })).rejects.toMatchObject({
      kind: "defect",
    });
    expect(invalidHandler).toBe(false);
  });

  test("rejects invalid input before admission and still completes hooks", async () => {
    let called = false;
    const events: string[] = [];
    await expect(
      invokeFunction(
        target(() => {
          called = true;
          return { value: 1 };
        }),
        { value: "wrong" },
        {
          idSource: ids(),
          admit: () => {
            throw new Error("must not admit");
          },
          hooks: {
            onCompletion: (event) => events.push(`complete:${event.outcome}`),
            onRelease: (event) => events.push(`release:${event.admitted}`),
          },
        },
      ),
    ).rejects.toBeInstanceOf(InvocationValidationError);
    expect(called).toBe(false);
    expect(events).toEqual(["complete:validation-error", "release:false"]);
  });

  test("turns invalid output into a defect and releases admission", async () => {
    let released = false;
    let failure: unknown;
    try {
      await invokeFunction(
        target(() => ({ value: "wrong" })),
        { value: 1 },
        {
          idSource: ids(),
          admit: () => ({ release: () => (released = true) }),
        },
      );
    } catch (cause) {
      failure = cause;
    }
    expect((failure as { kind: string }).kind).toBe("defect");
    expect(released).toBe(true);
  });

  test("validates declared error data before exposing it", async () => {
    const data = z.object({ reason: z.string() });
    const declared = (): Error => {
      const error = new Error("not available") as Error & Record<string, unknown>;
      error.name = "DeclaredError";
      error.id = "orders.unavailable";
      error.data = { reason: "sold out" };
      error.retry = "never";
      error.ref = { kind: "error", id: "orders.unavailable" };
      return error;
    };
    const failure = await invokeFunction(
      target(
        () => {
          throw declared();
        },
        { errors: [{ id: "orders.unavailable", data }] },
      ),
      { value: 1 },
      { idSource: ids() },
    ).catch((cause) => cause as { kind: string; id: string; data: unknown });
    expect(failure).toMatchObject({
      kind: "application",
      id: "orders.unavailable",
      data: { reason: "sold out" },
    });
  });

  test("runs plain and Effect function failures through the declared error path", async () => {
    const unavailable = defineError({
      id: "orders.returned-unavailable",
      data: z.object({ reason: z.string() }),
      message: ({ reason }) => reason,
      retry: "never",
    });
    const input = z.object({});
    const output = z.object({ ok: z.boolean() });
    const plain = defineFunction({
      id: "orders.returned-plain",
      input,
      output,
      errors: [unavailable],
      handler: () => fail(unavailable, { reason: "sold out" }),
    });
    const direct = defineFunction({
      id: "orders.returned-direct",
      input,
      output,
      errors: [unavailable],
      handler: () => new unavailable({ reason: "sold out" }),
    });
    const effect = defineFunction({
      id: "orders.returned-effect",
      input,
      output,
      errors: [unavailable],
      handler: () => Effect.fail(unavailable.create({ reason: "sold out" })),
    });

    for (const target of [plain, direct, effect]) {
      await expect(invokeFunction(target, {})).rejects.toMatchObject({
        kind: "application",
        id: "orders.returned-unavailable",
        data: { reason: "sold out" },
      });
    }
  });
});

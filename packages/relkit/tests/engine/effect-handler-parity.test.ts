/** Runs Promise and Effect handlers side by side through the engine and compares what callers see. */
import { Effect } from "effect";
import { describe, expect, test } from "vitest";
import { defineError, defineFunction, fail } from "../../src/app/index.js";
import { failEffect } from "../../src/app/effect.js";
import type { ProtocolId } from "../../src/contracts/index.js";
import { invokeFunction, type InvocationCompletion } from "../../src/engine/invoke.js";
import { z } from "../../src/schema/index.js";
import { invocationTarget } from "./fixtures.js";

const soldOut = defineError({
  id: "orders.sold-out",
  data: z.object({ sku: z.string() }),
  message: ({ sku }) => `${sku} is sold out`,
  http: { status: 409 },
});

type Style = "promise" | "effect";
type Handler = (input: { sku: string }, context: { signal: AbortSignal }) => unknown;

/** One handler body written both ways. */
interface Case {
  readonly promise: Handler;
  readonly effect: Handler;
}

function order(style: Style, cases: Case) {
  return invocationTarget(
    defineFunction({
      id: `orders.${style}`,
      input: z.object({ sku: z.string() }),
      output: z.object({ sku: z.string(), reserved: z.boolean() }),
      errors: [soldOut],
      handler: cases[style] as never,
    }),
  );
}

interface Observed {
  readonly value?: unknown;
  readonly error?: unknown;
  readonly spans: readonly string[];
  readonly completion?: InvocationCompletion;
}

async function run(
  style: Style,
  cases: Case,
  options: { readonly timeoutMs?: number; readonly signal?: AbortSignal } = {},
): Promise<Observed> {
  let next = 0;
  const spans: string[] = [];
  let completion: InvocationCompletion | undefined;
  const settled = await invokeFunction(
    order(style, cases),
    { sku: "tea" },
    {
      ...options,
      idSource: { next: (kind) => `${kind}-${++next}` as ProtocolId },
      hooks: {
        onSpanStart: (span) => {
          spans.push(`start:${span.name.replace(style, "*")}`);
        },
        onSpanComplete: (span) => {
          spans.push(`end:${span.name.replace(style, "*")}:${span.status}`);
        },
        onCompletion: (event) => {
          completion = event;
        },
      },
    },
  ).then(
    (value) => ({ value }),
    (error: unknown) => ({ error }),
  );
  return { ...settled, spans, ...(completion === undefined ? {} : { completion }) };
}

/** The parts of an outcome that must not depend on how the handler was written. */
function visible(observed: Observed) {
  const error = observed.error as Record<string, unknown> | undefined;
  return {
    value: observed.value,
    error:
      error === undefined
        ? undefined
        : { name: error.name, kind: error.kind, id: error.id, data: error.data, code: error.code },
    spans: observed.spans,
    outcome: observed.completion?.outcome,
    publicError: observed.completion?.publicError,
    recordStatus: observed.completion?.record.status,
  };
}

async function expectSameOutcome(
  cases: Case,
  options: () => { readonly timeoutMs?: number; readonly signal?: AbortSignal } = () => ({}),
) {
  const promise = await run("promise", cases, options());
  const effect = await run("effect", cases, options());
  expect(visible(effect)).toEqual(visible(promise));
  return promise;
}

describe("Promise and Effect handlers", () => {
  test("return the same validated output and spans", async () => {
    const outcome = await expectSameOutcome({
      promise: async ({ sku }) => ({ sku, reserved: true }),
      effect: ({ sku }) => Effect.succeed({ sku, reserved: true }),
    });
    expect(outcome.value).toEqual({ sku: "tea", reserved: true });
    expect(outcome.completion?.outcome).toBe("success");
  });

  test("map a declared error to the same application failure", async () => {
    const outcome = await expectSameOutcome({
      promise: async ({ sku }) => {
        throw new soldOut({ sku });
      },
      effect: ({ sku }) => Effect.fail(new soldOut({ sku })),
    });
    expect(outcome.error).toMatchObject({
      kind: "application",
      id: "orders.sold-out",
      data: { sku: "tea" },
    });
  });

  test("map fail and failEffect to the same application failure", async () => {
    const outcome = await expectSameOutcome({
      promise: async ({ sku }) => fail(soldOut, { sku }),
      effect: ({ sku }) => failEffect(soldOut, { sku }),
    });
    expect(outcome.error).toMatchObject({ kind: "application", id: "orders.sold-out" });
  });

  test("map an undeclared failure to the same internal failure", async () => {
    const outcome = await expectSameOutcome({
      promise: async () => {
        throw new Error("database offline");
      },
      effect: () => Effect.fail(new Error("database offline")),
    });
    expect(outcome.completion?.outcome).toBe("defect");
  });

  test("map a thrown defect to the same internal failure", async () => {
    await expectSameOutcome({
      promise: async () => {
        throw new TypeError("bad state");
      },
      effect: () =>
        Effect.sync(() => {
          throw new TypeError("bad state");
        }),
    });
  });

  test("reject output that breaks the schema the same way", async () => {
    await expectSameOutcome({
      promise: async () => ({ sku: 1 }),
      effect: () => Effect.succeed({ sku: 1 }),
    });
  });

  test("cancel both when the caller aborts, and interrupt the Effect", async () => {
    let interrupted = 0;
    let controller = new AbortController();
    const started = () =>
      setTimeout(() => {
        controller.abort(new DOMException("caller left", "AbortError"));
      }, 10);
    const outcome = await expectSameOutcome(
      {
        promise: () => {
          started();
          return new Promise(() => undefined);
        },
        effect: () =>
          Effect.sync(started).pipe(
            Effect.andThen(Effect.never),
            Effect.onInterrupt(() =>
              Effect.sync(() => {
                interrupted += 1;
              }),
            ),
          ),
      },
      () => {
        controller = new AbortController();
        return { signal: controller.signal };
      },
    );
    expect(outcome.error).toBeDefined();
    expect(outcome.completion?.outcome).not.toBe("success");
    expect(interrupted).toBe(1);
  });

  test("time out both at the deadline, and interrupt the Effect", async () => {
    let started = 0;
    let interrupted = 0;
    const outcome = await expectSameOutcome(
      {
        promise: () => {
          started += 1;
          return new Promise(() => undefined);
        },
        effect: () =>
          Effect.sync(() => {
            started += 1;
          }).pipe(
            Effect.andThen(Effect.never),
            Effect.onInterrupt(() =>
              Effect.sync(() => {
                interrupted += 1;
              }),
            ),
          ),
      },
      () => ({ timeoutMs: 250 }),
    );
    expect(outcome.completion?.outcome).toBe("timeout");
    expect(started).toBe(2);
    expect(interrupted).toBe(1);
  });

  test("pass the same cancellation signal to both handlers", async () => {
    const seen: Record<Style, boolean> = { promise: false, effect: false };
    await expectSameOutcome({
      promise: async ({ sku }, context) => {
        seen.promise = context.signal instanceof AbortSignal && !context.signal.aborted;
        return { sku, reserved: true };
      },
      effect: ({ sku }, context) =>
        Effect.sync(() => {
          seen.effect = context.signal instanceof AbortSignal && !context.signal.aborted;
          return { sku, reserved: true };
        }),
    });
    expect(seen).toEqual({ promise: true, effect: true });
  });

  test("run both inside the invocation's trace, and nest Effect spans under it", async () => {
    const seen: Record<Style, string | undefined> = { promise: undefined, effect: undefined };
    const spans: { name: string; spanId: string; parent?: string; traceId: string }[] = [];
    const traced = (style: Style, handler: Handler) =>
      invokeFunction(
        invocationTarget(
          defineFunction({
            id: `orders.trace-${style}`,
            input: z.object({ sku: z.string() }),
            output: z.object({ sku: z.string(), reserved: z.boolean() }),
            handler: handler as never,
          }),
        ),
        { sku: "tea" },
        {
          hooks: {
            onSpanStart: (span) => {
              spans.push({
                name: span.name,
                spanId: span.spanId,
                traceId: span.traceId,
                ...(span.parentSpanId === undefined ? {} : { parent: span.parentSpanId }),
              });
            },
          },
        },
      );
    await traced("promise", async ({ sku }, context) => {
      seen.promise = (context as unknown as { invocation: { traceId: string } }).invocation.traceId;
      return { sku, reserved: true };
    });
    await traced("effect", ({ sku }) =>
      Effect.gen(function* () {
        const span = yield* Effect.currentSpan;
        seen.effect = span.traceId;
        return { sku, reserved: true };
      }).pipe(Effect.withSpan("orders.lookup")),
    );
    const root = (style: Style) =>
      spans.find((span) => span.name === `relkit.invoke.orders.trace-${style}`);
    expect(seen.promise).toBe(root("promise")?.traceId);
    expect(seen.effect).toBe(root("effect")?.traceId);
    const lookup = spans.find((span) => span.name === "orders.lookup");
    const ancestors: string[] = [];
    for (let span = lookup; span?.parent !== undefined;) {
      ancestors.push(span.parent);
      span = spans.find((candidate) => candidate.spanId === span?.parent);
    }
    expect(ancestors).toContain(root("effect")?.spanId);
  });
});

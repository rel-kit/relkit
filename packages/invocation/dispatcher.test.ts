import { Effect } from "effect";
import { describe, expect, test } from "bun:test";
import {
  DependencyNotConfiguredError,
  dispatchInvocation,
  createStandaloneDispatcher,
  currentInvocationDispatcher,
  runInInvocationScope,
  type InvocationCompletion,
  type InvocationDispatchRequest,
  type InvocationDispatcher,
  type LocalStructuredLogger,
  type InvocationTarget,
} from "./src/index.ts";
import { z } from "@zsys/schema";

const empty = z.object({});

function namedDispatcher(name: string): InvocationDispatcher {
  return {
    dispatch: async <Input, Output, Context extends { readonly signal: AbortSignal }>(
      request: InvocationDispatchRequest<Input, Output, Context>,
    ) => `${name}:${request.target.id}` as Output,
  };
}

describe("invocation dispatch scope", () => {
  test("keeps concurrent asynchronous scopes isolated", async () => {
    const target: InvocationTarget = {
      id: "orders.lookup",
      input: empty,
      output: z.string(),
      handler: () => "standalone",
    };
    const first = namedDispatcher("first");
    const second = namedDispatcher("second");
    const invoke = (dispatcher: InvocationDispatcher) =>
      runInInvocationScope({ dispatcher }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
        return dispatchInvocation({ target, input: {} });
      });

    expect(await Promise.all([invoke(first), invoke(second)])).toEqual([
      "first:orders.lookup",
      "second:orders.lookup",
    ]);
    expect(currentInvocationDispatcher()).toBeUndefined();
  });

  test("runs a standalone target through validation, local context, and Effect", async () => {
    let logger: LocalStructuredLogger | undefined;
    const target: InvocationTarget<number, { readonly value: number }> = {
      id: "orders.double",
      input: z.number(),
      output: z.object({ value: z.number() }),
      handler: (value, context) => {
        logger = context.log as LocalStructuredLogger;
        context.log.info("standalone", { value });
        expect(Object.isFrozen(context.env)).toBe(true);
        expect(context.signal).toBeInstanceOf(AbortSignal);
        return Effect.succeed({ value: value * 2 });
      },
    };
    const completions: InvocationCompletion[] = [];
    const result = await createStandaloneDispatcher({
      env: { region: "test" },
      now: () => 1_000,
      onCompletion: (completion) => completions.push(completion),
    }).dispatch({ target, input: 3 });

    expect(result).toEqual({ value: 6 });
    expect(logger?.records).toMatchObject([{ level: "info", message: "standalone" }]);
    expect(completions[0]?.record.status).toBe("success");
  });

  test("inherits the active standalone parent without a global runtime", async () => {
    const completions: InvocationCompletion[] = [];
    const child: InvocationTarget = {
      id: "orders.child",
      input: empty,
      output: z.object({ ok: z.literal(true) }),
      handler: () => ({ ok: true }),
    };
    const parent: InvocationTarget = {
      id: "orders.parent",
      input: empty,
      output: z.object({ ok: z.literal(true) }),
      handler: () => dispatchInvocation({ target: child, input: {} }),
    };

    await createStandaloneDispatcher({ onCompletion: (value) => completions.push(value) }).dispatch(
      {
        target: parent,
        input: {},
      },
    );
    const root = completions.find((value) => value.record.functionId === "orders.parent");
    const nested = completions.find((value) => value.record.functionId === "orders.child");
    expect(nested?.record.parentId).toBe(root?.record.id);
    expect(nested?.record.traceId).toBe(root?.record.traceId);
    expect(currentInvocationDispatcher()).toBeUndefined();
  });

  test("fails clearly when a managed dependency has no standalone client", async () => {
    const target: InvocationTarget = {
      id: "orders.publish",
      input: empty,
      output: empty,
      handler: (_input, context) => {
        const jobs = context.jobs as unknown as Record<string, (value: unknown) => Promise<void>>;
        return jobs.publish({});
      },
    };

    await expect(
      createStandaloneDispatcher().dispatch({ target, input: {} }),
    ).rejects.toMatchObject({
      code: "ZSYS_DEPENDENCY_NOT_CONFIGURED",
      kind: "provider",
      outcome: "provider-failure",
    });
    expect(new DependencyNotConfiguredError("jobs", "publish").message).toContain("jobs.publish");
  });

  test("rejects a dynamic cycle before re-entering the target", async () => {
    let calls = 0;
    let target: InvocationTarget;
    target = {
      id: "orders.recursive",
      input: empty,
      output: empty,
      handler: () => {
        calls += 1;
        return dispatchInvocation({ target, input: {} });
      },
    };

    await expect(
      createStandaloneDispatcher().dispatch({ target, input: {} }),
    ).rejects.toMatchObject({
      code: "ZSYS_RECURSION_DENIED",
      outcome: "defect",
    });
    expect(calls).toBe(1);
  });
});

import { describe, expect, test } from "vitest";
import { z } from "@relkit/schema";
import {
  createStandaloneDispatcher,
  currentInvocationDispatcher,
  dispatchInvocation,
  type InvocationTarget,
} from "../src/index.ts";

const empty = z.object({});

describe("standalone descriptor runtime concurrency and cancellation", () => {
  test("keeps concurrent standalone runtimes isolated", async () => {
    let started = 0;
    let release!: () => void;
    let bothStarted!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const ready = new Promise<void>((resolve) => (bothStarted = resolve));
    const child: InvocationTarget = {
      id: "orders.runtime-child",
      input: empty,
      output: z.string(),
      handler: async (_input, context) => {
        started += 1;
        if (started === 2) bothStarted();
        await gate;
        return String(context.env.runtime);
      },
    };
    const parent: InvocationTarget = {
      id: "orders.runtime-parent",
      input: empty,
      output: z.string(),
      handler: () => dispatchInvocation({ target: child, input: {} }),
    };
    const first = createStandaloneDispatcher({ env: { runtime: "first" } });
    const second = createStandaloneDispatcher({ env: { runtime: "second" } });
    const firstCall = first.dispatch({ target: parent, input: {} });
    const secondCall = second.dispatch({ target: parent, input: {} });

    await ready;
    release();
    expect(await Promise.all([firstCall, secondCall])).toEqual(["first", "second"]);
    expect(currentInvocationDispatcher()).toBeUndefined();
  });

  test("propagates cancellation to an in-flight nested call and cleans up", async () => {
    const controller = new AbortController();
    let childStarted!: () => void;
    let childAborted = false;
    const started = new Promise<void>((resolve) => (childStarted = resolve));
    const child: InvocationTarget = {
      id: "orders.cancel-child",
      input: empty,
      output: z.object({ ok: z.literal(true) }),
      handler: (_input, context) =>
        new Promise((_resolve, reject) => {
          childStarted();
          context.signal.addEventListener(
            "abort",
            () => {
              childAborted = true;
              reject(context.signal.reason);
            },
            { once: true },
          );
        }),
    };
    const parent: InvocationTarget = {
      id: "orders.cancel-parent",
      input: empty,
      output: z.object({ ok: z.literal(true) }),
      handler: () => dispatchInvocation({ target: child, input: {} }),
    };
    const execution = createStandaloneDispatcher({ signal: controller.signal }).dispatch({
      target: parent,
      input: {},
    });

    await started;
    controller.abort(new Error("cancelled"));
    await expect(execution).rejects.toMatchObject({ kind: "cancellation" });
    expect(childAborted).toBe(true);
    expect(currentInvocationDispatcher()).toBeUndefined();
  });

  test("fails closed for absent providers and dynamic cycles", async () => {
    const providerTarget: InvocationTarget = {
      id: "orders.provider",
      input: empty,
      output: empty,
      handler: (_input, context) =>
        (context.jobs as unknown as Record<string, () => Promise<unknown>>).publish(),
    };
    await expect(
      createStandaloneDispatcher().dispatch({ target: providerTarget, input: {} }),
    ).rejects.toMatchObject({ code: "RELKIT_DEPENDENCY_NOT_CONFIGURED" });

    let first!: InvocationTarget;
    let second!: InvocationTarget;
    let firstCalls = 0;
    let secondCalls = 0;
    first = {
      id: "orders.first",
      input: empty,
      output: empty,
      handler: () => {
        firstCalls += 1;
        return dispatchInvocation({ target: second, input: {} });
      },
    };
    second = {
      id: "orders.second",
      input: empty,
      output: empty,
      handler: () => {
        secondCalls += 1;
        return dispatchInvocation({ target: first, input: {} });
      },
    };
    await expect(
      createStandaloneDispatcher().dispatch({ target: first, input: {} }),
    ).rejects.toMatchObject({ code: "RELKIT_RECURSION_DENIED" });
    expect([firstCalls, secondCalls]).toEqual([1, 1]);
    expect(currentInvocationDispatcher()).toBeUndefined();
  });
});

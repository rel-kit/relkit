import { describe, expect, test } from "bun:test";
import {
  currentInvocationDispatcher,
  createStandaloneDispatcher,
  dispatchInvocation,
  type InvocationCompletion,
  type InvocationRecord,
  type InvocationTarget,
} from "./src/index.ts";
import { z } from "@relkit/schema";

const empty = z.object({});

function ids(prefix: string) {
  let sequence = 0;
  return {
    next: (kind: "trace" | "invocation" | "span") =>
      `${prefix}-${kind}-${++sequence}` as import("@relkit/contracts").ProtocolId,
  };
}

describe("standalone descriptor runtime", () => {
  test("validates input, output, and declared errors before release", async () => {
    const completions: InvocationCompletion[] = [];
    const releases: boolean[] = [];
    const dispatcher = createStandaloneDispatcher({
      onCompletion: (completion) => completions.push(completion),
      onRelease: ({ admitted }) => releases.push(admitted),
    });
    let inputCalled = false;
    const invalidInput: InvocationTarget = {
      id: "orders.invalid-input",
      input: z.object({ id: z.string() }),
      output: z.boolean(),
      handler: () => {
        inputCalled = true;
        return true;
      },
    };
    await expect(dispatcher.dispatch({ target: invalidInput, input: {} })).rejects.toMatchObject({
      code: "RELKIT_INPUT_VALIDATION",
      phase: "input",
    });
    expect(inputCalled).toBe(false);

    const invalidOutput: InvocationTarget = {
      id: "orders.invalid-output",
      input: empty,
      output: z.boolean(),
      handler: () => "wrong",
    };
    await expect(dispatcher.dispatch({ target: invalidOutput, input: {} })).rejects.toMatchObject({
      code: "RELKIT_UNEXPECTED_DEFECT",
      kind: "defect",
    });

    const errorData = z.object({ reason: z.string() });
    const declaredTarget: InvocationTarget = {
      id: "orders.declared-error",
      input: empty,
      output: z.object({ ok: z.literal(true) }),
      errors: [{ id: "orders.invalid", data: errorData }],
      handler: () => {
        throw Object.assign(new Error("Order is unavailable"), {
          name: "DeclaredError",
          id: "orders.invalid",
          ref: { kind: "error", id: "orders.invalid" },
          data: { reason: "sold out" },
          retry: "never",
        });
      },
    };
    await expect(dispatcher.dispatch({ target: declaredTarget, input: {} })).rejects.toMatchObject({
      kind: "application",
      code: "orders.invalid",
      retry: "never",
    });

    const invalidError: InvocationTarget = {
      ...declaredTarget,
      id: "orders.invalid-error-data",
      handler: () => {
        throw Object.assign(new Error("Invalid error data"), {
          name: "DeclaredError",
          id: "orders.invalid",
          ref: { kind: "error", id: "orders.invalid" },
          data: { reason: 42 },
          retry: "never",
        });
      },
    };
    await expect(dispatcher.dispatch({ target: invalidError, input: {} })).rejects.toMatchObject({
      code: "RELKIT_UNEXPECTED_DEFECT",
      kind: "defect",
    });

    expect(completions.map(({ outcome }) => outcome)).toEqual([
      "validation-error",
      "defect",
      "declared-error",
      "defect",
    ]);
    expect(releases).toEqual([false, false, false, false]);
    expect(currentInvocationDispatcher()).toBeUndefined();
  });

  test("inherits trace and deadline through nested standalone calls", async () => {
    const records: InvocationRecord[] = [];
    const now = Date.now();
    let childSignal: AbortSignal | undefined;
    const child: InvocationTarget = {
      id: "orders.child",
      input: empty,
      output: z.object({ ok: z.literal(true) }),
      timeoutMs: 10_000,
      handler: (_input, context) => {
        childSignal = context.signal;
        return { ok: true };
      },
    };
    const parent: InvocationTarget = {
      id: "orders.parent",
      input: empty,
      output: z.object({ ok: z.literal(true) }),
      handler: () => dispatchInvocation({ target: child, input: {} }),
    };
    const dispatcher = createStandaloneDispatcher({
      now: () => now,
      timeoutMs: 5_000,
      correlationId: "request-1",
      idSource: ids("nested"),
      onInvocationStart: (record) => records.push(record),
    });

    await expect(dispatcher.dispatch({ target: parent, input: {} })).resolves.toEqual({ ok: true });

    const root = records.find((record) => record.functionId === parent.id);
    const nested = records.find((record) => record.functionId === child.id);
    expect(nested).toMatchObject({
      parentId: root?.id,
      traceId: root?.traceId,
      correlationId: "request-1",
      deadline: new Date(now + 5_000).toISOString(),
    });
    expect(childSignal?.aborted).toBe(false);
    expect(currentInvocationDispatcher()).toBeUndefined();
  });

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

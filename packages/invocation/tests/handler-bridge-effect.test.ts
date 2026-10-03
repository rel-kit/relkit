import { describe, expect, test, vi } from "vitest";
import { Effect, Layer } from "effect";
import { InvocationTelemetry, invokeUserHandler } from "../src/index.js";
import type { InvocationOperation } from "../src/index.js";

describe("handler bridge Effect", () => {
  test("disconnects completed nonstream handlers from later parent cancellation", async () => {
    const parent = new AbortController();
    let signal!: AbortSignal;
    expect(
      await Effect.runPromise(
        invokeUserHandler({
          input: undefined,
          publicContext: { signal: parent.signal },
          handler: (_input, context) => {
            signal = context.signal;
            return "done";
          },
        }),
      ),
    ).toBe("done");
    parent.abort("after completion");
    expect(signal.aborted).toBe(false);
  });

  test("preserves the identity and branded members of deferred output", async () => {
    class Output {
      #label = "source";
      get label() {
        return this.#label;
      }
      async *[Symbol.asyncIterator]() {
        yield this.#label;
      }
    }
    const source = Object.freeze(new Output());
    const result = await Effect.runPromise(
      invokeUserHandler({
        deferredStream: true,
        handler: () => source,
        input: undefined,
        publicContext: { signal: new AbortController().signal },
      }),
    );
    expect(result).toBe(source);
    expect(result.label).toBe("source");
    expect((await result[Symbol.asyncIterator]().next()).value).toBe("source");
  });

  for (const operation of ["return", "throw"] as const) {
    test(`keeps cancellation linked when ${operation} yields a nonterminal item`, async () => {
      const parent = new AbortController();
      const remove = vi.spyOn(parent.signal, "removeEventListener");
      let linked!: AbortSignal;
      try {
        const stream = await Effect.runPromise(
          invokeUserHandler({
            deferredStream: true,
            input: undefined,
            publicContext: { signal: parent.signal },
            handler: async function* (_input, context) {
              linked = context.signal;
              try {
                yield 1;
              } catch {
                yield 2;
              } finally {
                if (operation === "return") yield 3;
              }
            },
          }),
        );
        const iterator = stream[Symbol.asyncIterator]();
        await iterator.next();
        const recovered =
          operation === "return"
            ? await iterator.return!(undefined)
            : await iterator.throw!(new Error("recoverable consumer error"));
        expect(recovered.done).toBe(false);
        expect(remove).toHaveBeenCalledTimes(1);
        parent.abort("caller stopped");
        expect(linked.aborted).toBe(true);
        expect((await iterator.next()).done).toBe(true);
        expect(remove).toHaveBeenCalledTimes(1);
      } finally {
        remove.mockRestore();
      }
    });
  }

  test("retains parent cancellation while deferred handler output is being pulled", async () => {
    const parent = new AbortController();
    const marker = new Error("stop deferred work");
    let started!: () => void;
    const pulling = new Promise<void>((resolve) => {
      started = resolve;
    });
    const stream = await Effect.runPromise(
      invokeUserHandler({
        deferredStream: true,
        input: undefined,
        publicContext: { signal: parent.signal },
        handler: async function* (_input, context) {
          await new Promise<void>((_resolve, reject) => {
            context.signal.addEventListener("abort", () => reject(context.signal.reason), {
              once: true,
            });
            started();
          });
          yield 1;
        },
      }),
    );
    const pending = stream[Symbol.asyncIterator]().next();
    const rejection = expect(pending).rejects.toBe(marker);
    await pulling;
    parent.abort(marker);
    await rejection;
  });

  for (const ending of ["eof", "return", "failure"] as const) {
    test(`releases callback listeners before deferred stream ${ending}`, async () => {
      const parent = new AbortController();
      const remove = vi.spyOn(parent.signal, "removeEventListener");
      const marker = new Error("deferred failure");
      try {
        const stream = await Effect.runPromise(
          invokeUserHandler({
            deferredStream: true,
            input: undefined,
            publicContext: { signal: parent.signal },
            handler: async function* () {
              yield 1;
              if (ending === "failure") throw marker;
            },
          }),
        );
        expect(remove).toHaveBeenCalledTimes(1);
        const iterator = stream[Symbol.asyncIterator]();
        await iterator.next();
        expect(remove).toHaveBeenCalledTimes(1);
        if (ending === "return") await iterator.return?.();
        else if (ending === "failure") await expect(iterator.next()).rejects.toBe(marker);
        else await iterator.next();
        expect(remove).toHaveBeenCalledTimes(1);
      } finally {
        remove.mockRestore();
      }
    });
  }

  test("observes successful Promise and Effect handler values", async () => {
    const observed: InvocationOperation[] = [];
    const layer = Layer.succeed(InvocationTelemetry, {
      observe: <A, E, R>(operation: InvocationOperation, effect: Effect.Effect<A, E, R>) => {
        observed.push(operation);
        return effect;
      },
    });
    const context = { signal: new AbortController().signal };
    const promise = invokeUserHandler({
      handler: async (value: number) => value + 1,
      input: 1,
      publicContext: context,
    });
    expect(await Effect.runPromise(Effect.provide(promise, layer))).toBe(2);
    const effect = invokeUserHandler({
      handler: (value: number) => Effect.succeed(value + 2) as never,
      input: 1,
      publicContext: context,
    });
    expect(await Effect.runPromise(Effect.provide(effect, layer))).toBe(3);
    expect(observed.filter((operation) => operation === "handler.invoke")).toHaveLength(2);
  });

  test("turns a thrown handler error into an invocation failure", async () => {
    const context = { signal: new AbortController().signal };
    const failure = await Effect.runPromise(
      Effect.catchTag(
        invokeUserHandler({
          handler: () => {
            throw new Error("private");
          },
          input: 1,
          publicContext: context,
        }),
        "UnexpectedDefect",
        (error) => Effect.succeed(error),
      ),
    );
    expect(failure).toMatchObject({
      _tag: "UnexpectedDefect",
      code: "RELKIT_UNEXPECTED_DEFECT",
    });
  });

  test("normalizes a timed handler failure through the deadline boundary", async () => {
    const context = { signal: new AbortController().signal };
    await expect(
      Effect.runPromise(
        invokeUserHandler({
          handler: async () => {
            throw new Error("private");
          },
          input: 1,
          publicContext: context,
          timeoutMs: 100,
        }),
      ),
    ).rejects.toMatchObject({ _tag: "UnexpectedDefect" });
  });

  test("releases the abort bridge when the signal hook throws", async () => {
    const parent = new AbortController();
    const remove = vi.spyOn(parent.signal, "removeEventListener");
    let started = false;
    const result = invokeUserHandler({
      handler: () => {
        started = true;
        return 1;
      },
      input: 1,
      publicContext: { signal: parent.signal },
      onSignal: () => {
        throw new Error("signal hook failed");
      },
    });
    await expect(Effect.runPromise(result)).rejects.toMatchObject({ _tag: "UnexpectedDefect" });
    expect(started).toBe(false);
    expect(remove).toHaveBeenCalled();
    remove.mockRestore();
  });
});

import { expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { acquireClientOwner } from "../../src/client-owner.js";
import { ClientTransport } from "../../src/transport.service.js";

it.effect("close interrupts and joins pending owned work exactly once", () =>
  Effect.gen(function* () {
    let finalized = 0;
    const live = Layer.succeed(
      ClientTransport,
      ClientTransport.of({
        invoke: Effect.fn("ClientTransport.pendingTest")(() =>
          Effect.never.pipe(
            Effect.ensuring(
              Effect.sync(() => {
                finalized++;
              }),
            ),
          ),
        ),
      }),
    );
    const owner = yield* Effect.acquireRelease(
      Effect.sync(() => acquireClientOwner(live, ClientTransport)),
      (owner) => Effect.promise(() => owner.close()),
    );
    const pending = owner
      .run(owner.service.invoke([], undefined, { context: {} }))
      .catch((error) => error);
    const closing = owner.close();
    expect(owner.close()).toBe(closing);
    yield* Effect.promise(() => closing);
    expect(finalized).toBe(1);
    expect(yield* Effect.promise(() => pending)).toBeInstanceOf(Error);
  }).pipe(Effect.scoped),
);

it.effect("failed synchronous acquisition closes its prefix and retains the original defect", () =>
  Effect.sync(() => {
    let finalized = 0;
    const original = { code: "constructor-defect" };
    const failed = Layer.effect(
      ClientTransport,
      Effect.gen(function* () {
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            finalized++;
          }),
        );
        return yield* Effect.die(original);
      }),
    );
    let caught: unknown;
    try {
      acquireClientOwner(failed, ClientTransport);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBe(original);
    expect(finalized).toBe(1);
  }),
);

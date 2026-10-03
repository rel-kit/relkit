import { expect, it } from "@effect/vitest";
import type { GraphEdge } from "@relkit/graph";
import { currentNativeEffectContext } from "@relkit/runtime-effect";
import { Context, Effect, References } from "effect";
import { enginePromise } from "../src/engine-runtime.js";
import { createObservationScope } from "../src/invoke-observation-scope.js";

const edge: GraphEdge = { kind: "calls-function", from: "parent", to: "child" };

it.effect("runs synchronous observers immediately with inherited Effect services", () =>
  Effect.gen(function* () {
    const observed: string[] = [];
    const owner = yield* enginePromise(() =>
      createObservationScope({
        onDeclaredEdge: () => {
          observed.push(Context.get(currentNativeEffectContext()!, References.MinimumLogLevel));
          throw new Error("isolated observer failure");
        },
      }),
    ).pipe(Effect.provideService(References.MinimumLogLevel, "Error"));
    yield* enginePromise(() =>
      Promise.resolve().then(() => {
        owner.hooks!.onDeclaredEdge!(edge);
        expect(observed).toEqual(["Error"]);
      }),
    );
    yield* enginePromise(owner.close);
    owner.hooks!.onDeclaredEdge!(edge);
    expect(observed).toEqual(["Error"]);
  }),
);

it("owns pending and rejected observer Promises until scope closure", async () => {
  let calls = 0;
  const owner = await createObservationScope({
    onDeclaredEdge: () => {
      calls++;
      return calls === 1
        ? Promise.reject(new Error("isolated rejection"))
        : new Promise<void>(() => undefined);
    },
  });
  owner.hooks!.onDeclaredEdge!(edge);
  owner.hooks!.onDeclaredEdge!(edge);
  await owner.close();
  await owner.close();
  expect(calls).toBe(2);
});

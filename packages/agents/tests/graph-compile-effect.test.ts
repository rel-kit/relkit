import { Effect, Result } from "effect";
import { expect, test } from "vitest";
import { runGraphRouteEffect } from "../src/graph-compile.js";

test("graph route Effect validates destinations and tags route failures", async () => {
  const ids = new Set(["next"]);
  expect(await Effect.runPromise(runGraphRouteEffect(() => "next", {}, {}, ids))).toBe("next");
  const failure = await Effect.runPromise(Effect.result(
    runGraphRouteEffect(() => "missing", {}, {}, ids),
  ));
  expect(Result.isFailure(failure)).toBe(true);
  if (Result.isFailure(failure)) expect(failure.failure._tag).toBe("GraphCompilationFailure");
});

test("interrupting a graph route aborts the signal seen by its callback", async () => {
  const controller = new AbortController();
  let started!: () => void;
  const start = new Promise<void>((resolve) => { started = resolve; });
  let observedAbort = false;
  const running = Effect.runPromise(runGraphRouteEffect((_state, config) =>
    new Promise<never>((_resolve, reject) => {
      config.signal?.addEventListener("abort", () => {
        observedAbort = true;
        reject(config.signal?.reason);
      }, { once: true });
      started();
    }), {}, {}, new Set(["next"])), { signal: controller.signal });
  await start;
  controller.abort(new Error("stopped"));
  await expect(running).rejects.toBeDefined();
  expect(observedAbort).toBe(true);
});

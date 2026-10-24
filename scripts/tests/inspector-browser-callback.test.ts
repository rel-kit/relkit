/** Verifies the native UI boundary joins cancellation before its caller can
 * release browser/server resources, and preserves native assertion failures.
 */
import { expect, test } from "bun:test";
import { Effect, Exit } from "effect";
import { browserCallback } from "../inspector-browser-callback.js";

test("browser cancellation joins its native callback before owner retirement", async () => {
  const entered = Promise.withResolvers<void>();
  const aborted = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const controller = new AbortController();
  let joined = false;
  const running = Effect.runPromiseExit(
    browserCallback(async (signal) => {
      signal.addEventListener("abort", () => aborted.resolve(), { once: true });
      entered.resolve();
      await release.promise;
      joined = true;
    }),
    { signal: controller.signal },
  );
  try {
    await entered.promise;
    controller.abort();
    await aborted.promise;
    const retired = await Promise.race([running.then(() => true), Bun.sleep(25).then(() => false)]);
    expect(retired).toBe(false);
    expect(joined).toBe(false);
  } finally {
    release.resolve();
    await running;
  }
  expect(joined).toBe(true);
});

test("browser callback preserves the original native assertion error", async () => {
  const failure = new Error("native UI assertion failed");
  const exit = await Effect.runPromiseExit(
    browserCallback(async () => {
      throw failure;
    }),
  );
  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isFailure(exit))
    expect(
      exit.cause.reasons.some((reason) => reason._tag === "Fail" && reason.error === failure),
    ).toBe(true);
});

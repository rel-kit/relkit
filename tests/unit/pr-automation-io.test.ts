/** Verifies native preparation failures remain typed and interruption waits for external cleanup before reporting completion. */
import { expect, test } from "bun:test";
import { Effect } from "effect";
import { prepareOperation } from "../../scripts/pr-automation-io.ts";

test("native failures keep the preparation stage and diagnostic", async () => {
  const result = await Effect.runPromise(
    prepareOperation("fixture.read", async () => {
      throw new Error("file could not be read");
    }).pipe(
      Effect.catchTag("PrPreparationError", (error) =>
        Effect.succeed({ operation: error.operation, message: error.message }),
      ),
    ),
  );
  expect(result).toEqual({ operation: "fixture.read", message: "file could not be read" });
});

test("interruption aborts native work and joins its cleanup", async () => {
  const started = Promise.withResolvers<void>();
  const aborted = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const controller = new AbortController();
  let cleaned = false;
  let completed = false;
  const operation = prepareOperation("fixture.cancel", async (signal) => {
    const cancelled = new Promise<void>((resolve) =>
      signal.addEventListener(
        "abort",
        () => {
          aborted.resolve();
          resolve();
        },
        { once: true },
      ),
    );
    started.resolve();
    await cancelled;
    await release.promise;
    cleaned = true;
  });
  const result = Effect.runPromise(operation, { signal: controller.signal }).then(
    () => {
      completed = true;
      return false;
    },
    () => {
      completed = true;
      return true;
    },
  );
  await started.promise;
  controller.abort();
  await aborted.promise;
  expect(completed).toBe(false);
  expect(cleaned).toBe(false);
  release.resolve();
  expect(await result).toBe(true);
  expect(cleaned).toBe(true);
});

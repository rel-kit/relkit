import { expect, it } from "vitest";
import { iterateNative } from "../../src/native/iterate.js";

it("caller abort releases a pending native pull and returns the iterator exactly once", async () => {
  const caller = new AbortController();
  let request: AbortSignal | undefined;
  let releases = 0;
  const started = Promise.withResolvers<void>();
  const iterator = iterateNative<number>(
    async (signal) => {
      request = signal;
      return {
        next: () =>
          new Promise<IteratorResult<number>>((_resolve, reject) => {
            signal.addEventListener("abort", () => reject(signal.reason), { once: true });
            started.resolve();
          }),
        return: async () => {
          releases++;
          return { done: true as const, value: undefined };
        },
      };
    },
    { signal: caller.signal },
  );
  const pending = iterator.next().catch((error) => error);
  await started.promise;
  caller.abort();
  expect(await pending).toBe(caller.signal.reason);
  expect(request?.aborted).toBe(true);
  expect(releases).toBe(1);
  await iterator.return();
  expect(releases).toBe(1);
});

it("breaking out aborts the request and returns the iterator without aborting the caller", async () => {
  const caller = new AbortController();
  let request: AbortSignal | undefined;
  let releases = 0;
  let index = 0;
  for await (const value of iterateNative<number>(
    async (signal) => {
      request = signal;
      return {
        next: async () => ({ done: false as const, value: index++ }),
        return: async () => {
          releases++;
          return { done: true as const, value: undefined };
        },
      };
    },
    { signal: caller.signal },
  ))
    if (value === 1) break;
  expect(request?.aborted).toBe(true);
  expect(caller.signal.aborted).toBe(false);
  expect(releases).toBe(1);
});

it("an iterator that opens after the caller aborted is still returned", async () => {
  const caller = new AbortController();
  const opened = Promise.withResolvers<AsyncIterator<number>>();
  const started = Promise.withResolvers<void>();
  let released = 0;
  const iterator = iterateNative<number>(
    () => {
      started.resolve();
      return opened.promise;
    },
    { signal: caller.signal },
  );
  const pending = iterator.next().catch((error) => error);
  await started.promise;
  caller.abort();
  opened.resolve({
    next: async () => ({ done: true, value: undefined }),
    return: async () => {
      released++;
      return { done: true, value: undefined };
    },
  });
  expect(await pending).toBe(caller.signal.reason);
  expect(released).toBe(1);
});

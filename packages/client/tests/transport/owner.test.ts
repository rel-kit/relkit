import { expect, it } from "vitest";
import { createClientTransport } from "../../src/transport.service.js";

it("close aborts and joins pending owned work exactly once", async () => {
  let finalized = 0;
  const started = Promise.withResolvers<void>();
  const transport = createClientTransport(async () => ({
    call: (_path, _input, options) =>
      new Promise((_resolve, reject) => {
        started.resolve();
        options.signal?.addEventListener(
          "abort",
          () => {
            finalized++;
            reject(options.signal?.reason);
          },
          { once: true },
        );
      }),
  }));
  const pending = transport.invoke([], undefined, { context: {} }).catch((error) => error);
  await started.promise;
  const closing = transport.close();
  expect(transport.close()).toBe(closing);
  await closing;
  expect(finalized).toBe(1);
  expect(await pending).toBeInstanceOf(Error);
  await expect(transport.invoke([], undefined, { context: {} })).rejects.toMatchObject({
    name: "AbortError",
  });
});

it("a failed selection rejects every call with its original identity", async () => {
  const original = { code: "constructor-defect" };
  let selections = 0;
  const transport = createClientTransport(async () => {
    selections++;
    throw original;
  });
  try {
    await expect(transport.invoke([], undefined, { context: {} })).rejects.toBe(original);
    await expect(transport.invoke([], undefined, { context: {} })).rejects.toBe(original);
    expect(selections).toBe(1);
  } finally {
    await transport.close();
  }
});

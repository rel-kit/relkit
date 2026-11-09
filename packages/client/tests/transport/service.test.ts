import { expect, it } from "vitest";
import { createClientTransport } from "../../src/transport.service.js";
import type { TransportLink } from "../../src/transport.types.js";

it("owner closure aborts and joins an unfinished shared selection", async () => {
  const started = Promise.withResolvers<void>();
  let released = false;
  const transport = createClientTransport(
    (signal) =>
      new Promise<TransportLink>((_resolve, reject) => {
        started.resolve();
        signal.addEventListener(
          "abort",
          () => {
            released = true;
            reject(signal.reason);
          },
          { once: true },
        );
      }),
  );
  const invocation = transport.invoke([], undefined, { context: {} });
  const settled = invocation.then(
    () => "fulfilled",
    () => "rejected",
  );
  await started.promise;
  await transport.close();
  expect(released).toBe(true);
  expect(await settled).toBe("rejected");
});

it("caller cancellation cannot cancel or poison shared owner selection", async () => {
  const started = Promise.withResolvers<void>();
  const ready = Promise.withResolvers<void>();
  let selections = 0;
  let aborted = false;
  const transport = createClientTransport(async (signal) => {
    selections++;
    signal.addEventListener("abort", () => (aborted = true), { once: true });
    started.resolve();
    await ready.promise;
    return { call: async () => "connected" };
  });
  try {
    const caller = new AbortController();
    const first = transport.invoke([], undefined, { context: {}, signal: caller.signal });
    await started.promise;
    const sibling = transport.invoke([], undefined, { context: {} });
    caller.abort();
    await expect(first).rejects.toBe(caller.signal.reason);
    expect(aborted).toBe(false);
    ready.resolve();
    expect(await sibling).toBe("connected");
    expect(await transport.invoke([], undefined, { context: {} })).toBe("connected");
    expect(selections).toBe(1);
    expect(aborted).toBe(false);
  } finally {
    await transport.close();
  }
});

it("selects a live link once and preserves original transport rejection identity", async () => {
  let selections = 0;
  let calls = 0;
  const signals: (AbortSignal | undefined)[] = [];
  const rejection = { code: "DECLARED_FAILURE", sensitive: "private-input" };
  const transport = createClientTransport(async () => {
    selections++;
    return {
      call: async (_path, _input, options) => {
        signals.push(options.signal);
        if (++calls === 3) throw rejection;
        return calls;
      },
    };
  });
  try {
    expect(selections).toBe(0);
    expect(await transport.invoke(["declared"], {}, { context: {} })).toBe(1);
    expect(await transport.invoke(["declared"], {}, { context: {} })).toBe(2);
    await expect(transport.invoke(["declared"], {}, { context: {} })).rejects.toBe(rejection);
    expect(selections).toBe(1);
    expect(signals.every((signal) => signal instanceof AbortSignal && !signal.aborted)).toBe(true);
  } finally {
    await transport.close();
  }
  expect(signals.every((signal) => signal?.aborted)).toBe(true);
});

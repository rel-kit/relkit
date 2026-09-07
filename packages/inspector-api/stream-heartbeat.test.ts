import { expect, spyOn, test } from "bun:test";
import { createObservabilityStream } from "@relkit/observability";
import { streamResponse } from "./src/observability-utils.js";

test("idle Inspector streams survive Bun's timeout through an HTTP proxy", async () => {
  const stream = createObservabilityStream();
  const backend = Bun.serve({ port: 0, fetch: (request) => streamResponse(stream, request, 1) });
  const proxy = Bun.serve({
    port: 0,
    fetch: (request) =>
      fetch(new URL("/?type=log.emitted", backend.url), { signal: request.signal }),
  });
  const abort = new AbortController();
  try {
    const response = await fetch(proxy.url, { signal: abort.signal });
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    expect(decoder.decode((await reader.read()).value)).toBe(": connected\n\n");
    for (let heartbeat = 0; heartbeat < 3; heartbeat += 1) {
      expect(decoder.decode((await reader.read()).value)).toBe(": heartbeat\n\n");
    }
    expect(stream.stats()).toMatchObject({ cursor: "0", published: 0, subscribers: 1 });
    stream.publish({ type: "log.emitted", data: { message: "still connected" } });
    const event = decoder.decode((await reader.read()).value);
    expect(event).toContain("id: 1\nevent: log.emitted\n");
    expect(event).toContain("still connected");
    await reader.cancel();
  } finally {
    abort.abort();
    stream.close();
    await proxy.stop(true);
    await backend.stop(true);
  }
}, 20_000);

test.each(["cancel", "abort", "close"] as const)(
  "heartbeat respects backpressure and releases its timer on %s",
  async (ending) => {
    const intervals = spyOn(globalThis, "setInterval");
    const cleared = spyOn(globalThis, "clearInterval");
    const stream = createObservabilityStream();
    const abort = new AbortController();
    const response = streamResponse(
      stream,
      new Request("http://localhost", { signal: abort.signal }),
      1,
    );
    const reader = response.body!.getReader();
    try {
      const tick = intervals.mock.calls[0]![0] as () => void;
      const timer = intervals.mock.results[0]!.value;
      expect(intervals.mock.calls[0]![1]).toBe(5_000);
      await reader.read();
      tick();
      tick();
      tick();
      expect(new TextDecoder().decode((await reader.read()).value)).toBe(": heartbeat\n\n");
      stream.publish({ type: "log.emitted", data: {} });
      expect(new TextDecoder().decode((await reader.read()).value)).toContain("event: log.emitted");
      if (ending === "cancel") await reader.cancel();
      else if (ending === "abort") abort.abort();
      else {
        stream.close();
        expect((await reader.read()).done).toBe(true);
      }
      await Promise.resolve();
      expect(stream.stats().subscribers).toBe(0);
      expect(cleared).toHaveBeenCalledWith(timer);
      expect(() => tick()).not.toThrow();
    } finally {
      await reader.cancel();
      stream.close();
      intervals.mockRestore();
      cleared.mockRestore();
    }
  },
);

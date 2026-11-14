import { expect, it } from "vitest";
import { createClient } from "../../src/transport.js";
import { iterateNative } from "../../src/native/iterate.js";

/** Encodes one oRPC event-stream message frame. */
const frame = (value: unknown): string =>
  `event: message\ndata: ${JSON.stringify({ json: value })}\n\n`;

/**
 * A fetch that answers with an event stream which sends the given frames and then stays open,
 * and which ignores the request's abort signal, as a transport may when a read is already
 * pending on the body.
 * @param frames - Values sent before the stream holds.
 * @returns The fetch and a promise settled when the client cancels the body.
 */
function holdingFetch(frames: readonly unknown[]) {
  const cancelled = Promise.withResolvers<void>();
  const encoder = new TextEncoder();
  const fetch = async (): Promise<Response> =>
    new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          for (const value of frames) controller.enqueue(encoder.encode(frame(value)));
        },
        cancel() {
          cancelled.resolve();
        },
      }),
      { status: 200, headers: { "content-type": "text/event-stream" } },
    );
  return { fetch, cancelled: cancelled.promise };
}

/**
 * Settles with "timeout" when the promise has not settled within the given time.
 * @param promise - Work under test.
 * @param ms - Allowed time.
 * @returns The promise's outcome or "timeout".
 */
function within<A>(promise: Promise<A>, ms: number): Promise<A | "timeout"> {
  return Promise.race([
    promise,
    new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), ms)),
  ]);
}

it("a subscription ends promptly when its caller aborts during a pending read", async () => {
  const frames = [
    { kind: "event", event: "changed", payload: { value: 1 } },
    { kind: "caught-up" },
    { kind: "event", event: "changed", payload: { value: 2 } },
  ];
  const server = holdingFetch(frames);
  const fetch = server.fetch as unknown as typeof globalThis.fetch;
  const client = createClient({ baseUrl: "http://relkit.test", fetch }) as never as {
    "relkit.realtime.subscribe": (
      input: unknown,
      options: { signal: AbortSignal },
    ) => Promise<AsyncIterable<unknown>>;
  };
  const caller = new AbortController();
  const received: unknown[] = [];
  const consumed = (async () => {
    const stream = await client["relkit.realtime.subscribe"](
      { channel: "orders.updates", params: { id: "one" } },
      { signal: caller.signal },
    );
    for await (const value of stream) {
      received.push(value);
      if (received.length === frames.length) setTimeout(() => caller.abort(), 10);
    }
  })();
  const outcome = await within(
    consumed.then(
      () => "ended",
      (error: unknown) => error,
    ),
    500,
  );
  expect(received).toEqual(frames);
  expect(outcome).toBe(caller.signal.reason);
  expect(await within(server.cancelled, 500)).toBeUndefined();
});

it("a native iteration ends when its caller aborts and the source ignores the signal", async () => {
  const caller = new AbortController();
  let releases = 0;
  const iterator = iterateNative<number>(
    async () => ({
      next: () => new Promise<IteratorResult<number>>(() => undefined),
      return: async () => {
        releases++;
        return { done: true as const, value: undefined };
      },
    }),
    { signal: caller.signal },
  );
  const pending = iterator.next().catch((error: unknown) => error);
  setTimeout(() => caller.abort(), 10);
  expect(await within(pending, 500)).toBe(caller.signal.reason);
  expect(releases).toBe(1);
});

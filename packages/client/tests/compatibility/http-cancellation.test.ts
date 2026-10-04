import { expect, test } from "bun:test";
import { oc } from "@orpc/contract";
import { createClient, createAutoClient } from "../../src/index.ts";

const schema = {
  "~standard": { version: 1 as const, vendor: "test", validate: (value: unknown) => ({ value }) },
};
const contract = { watch: oc.input(schema).output(schema) };

test.each([createClient, createAutoClient])(
  "HTTP iterator return cancels its request",
  async (create) => {
    let signal: AbortSignal | null | undefined;
    const caller = new AbortController();
    const client = create<typeof contract>({
      baseUrl: "http://relkit.test",
      establishmentTimeoutMs: 1,
      fetch: Object.assign(
        async (_url: string | URL | Request, init?: RequestInit) => {
          signal = init?.signal;
          return new Response(
            new ReadableStream({
              start(controller) {
                signal?.addEventListener("abort", () => controller.error(signal?.reason), {
                  once: true,
                });
                controller.enqueue(
                  new TextEncoder().encode('event: message\ndata: {"json":{"kind":"ready"}}\n\n'),
                );
              },
            }),
            { headers: { "content-type": "text/event-stream" } },
          );
        },
        { preconnect: fetch.preconnect },
      ),
    });
    const stream = await client.watch({}, { signal: caller.signal });
    if (stream === null || typeof stream !== "object" || !(Symbol.asyncIterator in stream)) {
      throw new Error("Expected a stream");
    }
    const iterator = (stream as AsyncIterable<unknown>)[Symbol.asyncIterator]();
    const getIterator = (stream as AsyncIterable<unknown>)[Symbol.asyncIterator];
    expect(getIterator()).toBe(iterator);
    expect((await iterator.next()).done).toBe(false);
    const pending = iterator.next().catch(() => undefined);
    await iterator.return?.();
    await pending;
    expect(signal?.aborted).toBe(true);
    expect(caller.signal.aborted).toBe(false);
  },
);

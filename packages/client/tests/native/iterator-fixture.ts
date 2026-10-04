import { oc } from "@orpc/contract";
import { createClient } from "../../src/transport.js";
import { createAgentSseClient } from "../../src/react/agent-sse-client.js";
import { readFirstWatchFrame } from "../../src/jobs/reconcile.js";
import { JobWatchReadTimeoutError } from "../../src/jobs/types.js";

const schema = {
  "~standard": {
    version: 1 as const,
    vendor: "native-fixture",
    validate: (value: unknown) => ({ value }),
  },
};
const contract = { watch: oc.input(schema).output(schema) };

/**
 * Proves pending pulls release real Bun HTTP responses on each public cleanup edge.
 * @param sse - Selects the canonical agent SSE adapter.
 * @param mode - Return, throw or explicit caller abort.
 * @returns Joined request cleanup, with original throw identity checked.
 */
async function verify(sse: boolean, mode: "return" | "throw" | "abort"): Promise<void> {
  const cancelled = Promise.withResolvers<void>();
  let requestSignal: AbortSignal | undefined;
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      requestSignal = request.signal;
      request.signal.addEventListener("abort", () => cancelled.resolve(), { once: true });
      return new Response(
        new ReadableStream({
          start(controller) {
            const observation = { kind: "event", event: { kind: "fixture-native" } };
            controller.enqueue(
              new TextEncoder().encode(
                sse
                  ? `data: ${JSON.stringify({ metadata: { relkit: { observation } } })}\n\n`
                  : 'event: message\ndata: {"json":{"kind":"ready"}}\n\n',
              ),
            );
          },
          cancel() {
            cancelled.resolve();
          },
        }),
        { headers: { "content-type": "text/event-stream" } },
      );
    },
  });
  const caller = new AbortController();
  let iterator: AsyncIterator<unknown> | undefined;
  try {
    const client = sse
      ? (createAgentSseClient({
          baseUrl: server.url.href,
          credentials: "include",
          fetch,
        }) as Record<string, (input: unknown, call: unknown) => Promise<AsyncIterable<unknown>>>)
      : createClient<typeof contract>({ baseUrl: server.url.href });
    const stream = sse
      ? await (
          client as Record<
            string,
            (input: unknown, call: unknown) => Promise<AsyncIterable<unknown>>
          >
        )["relkit.agent.observe"]!(
          { agentId: "agent", threadId: "thread", after: {} },
          { signal: caller.signal },
        )
      : ((await (client as ReturnType<typeof createClient<typeof contract>>).watch(
          {},
          { signal: caller.signal },
        )) as AsyncIterable<unknown>);
    iterator = stream[Symbol.asyncIterator]();
    if ((await iterator.next()).done) throw new Error("Native fixture returned no first frame.");
    const pending = iterator.next().catch(() => undefined);
    if (mode === "throw") {
      const original = { native: "throw identity" };
      let caught: unknown;
      try {
        await iterator.throw!(original);
      } catch (error) {
        caught = error;
      }
      if (caught !== original) throw new Error("Iterator throw changed original error identity.");
    } else if (mode === "abort") {
      caller.abort();
      await pending;
      await iterator.return!();
    } else await iterator.return!();
    await pending;
    await cancelled.promise;
    if (mode !== "abort" && caller.signal.aborted)
      throw new Error("Cleanup aborted borrowed controller.");
    if (!requestSignal?.aborted) throw new Error("Pending native server request was not aborted.");
  } finally {
    caller.abort();
    try {
      await iterator?.return?.();
    } finally {
      await server.stop(true);
    }
  }
}

for (const sse of [false, true])
  for (const mode of ["return", "throw", "abort"] as const) await verify(sse, mode);

/**
 * Checks that authoritative fallback aborts a real pending response before return.
 * @returns Joined native request cleanup without aborting the borrowed controller.
 */
async function verifyWatchFallback(): Promise<void> {
  const cancelled = Promise.withResolvers<void>();
  let requestSignal: AbortSignal | undefined;
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      requestSignal = request.signal;
      request.signal.addEventListener("abort", () => cancelled.resolve(), { once: true });
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(": connected\n\n"));
          },
          cancel() {
            cancelled.resolve();
          },
        }),
        { headers: { "content-type": "text/event-stream" } },
      );
    },
  });
  const caller = new AbortController();
  try {
    const client = createClient<{ jobs: { fixture: { runs: typeof contract } } }>({
      baseUrl: server.url.href,
    });
    let failure: unknown;
    try {
      await readFirstWatchFrame(client, "fixture", { runId: "run" }, caller.signal, 50);
    } catch (error) {
      failure = error;
    }
    if (!(failure instanceof JobWatchReadTimeoutError))
      throw new Error("Watch fallback changed timeout authority.");
    await cancelled.promise;
    if (!requestSignal?.aborted || caller.signal.aborted)
      throw new Error("Watch fallback did not release its own pending response.");
  } finally {
    caller.abort();
    await server.stop(true);
  }
}
await verifyWatchFallback();
console.log("native iterator cleanup: 7/7");

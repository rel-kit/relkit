import { strict as assert } from "node:assert";
import { createObservabilityStream } from "@relkit/observability";
import { streamResponse } from "../../src/observability-stream.js";
import type { NativeResponseReader } from "./native-stream.types.js";

/**
 * Exercises real Bun listeners and a proxy beyond their configured idle timeout.
 * @returns Completion after explicit native abort closes the live feed and both listeners.
 */
async function verifyProxy(): Promise<void> {
  const stream = createObservabilityStream();
  const nativeAbort = new AbortController();
  const backend = Bun.serve({
    port: 0,
    idleTimeout: 1,
    fetch: (request) =>
      streamResponse(stream, new Request(request, { signal: nativeAbort.signal }), 1, 100),
  });
  const proxy = Bun.serve({
    port: 0,
    idleTimeout: 1,
    fetch: (request) =>
      fetch(new URL("/?type=log.emitted", backend.url), { signal: request.signal }),
  });
  const abort = new AbortController();
  let reader: NativeResponseReader | undefined;
  try {
    const response = await fetch(proxy.url, { signal: abort.signal });
    assert.ok(response.body);
    const current = response.body.getReader();
    reader = current;
    const decode = new TextDecoder();
    assert.equal(decode.decode((await current.read()).value), ": connected\n\n");
    for (let index = 0; index < 12; index++)
      assert.equal(decode.decode((await current.read()).value), ": heartbeat\n\n");
    assert.equal(stream.stats().cursor, "0");
    assert.equal(stream.stats().published, 0);
    assert.equal(stream.stats().subscribers, 1);
    stream.publish({ type: "log.emitted", data: { message: "native alive" } });
    assert.match(decode.decode((await current.read()).value), /id: 1\nevent: log.emitted/);
    const pending = current.read().catch(() => ({ done: true }));
    const cancelled = current.cancel();
    abort.abort();
    // This probe uses explicit native cancellation authority. Socket propagation
    // is a separate production-proxy integration requirement.
    nativeAbort.abort();
    await cancelled;
    await pending;
    for (let attempt = 0; stream.stats().subscribers > 0 && attempt < 50; attempt++)
      await new Promise<void>((resolve) => setTimeout(resolve, 5));
    assert.equal(stream.stats().subscribers, 0);
    assert.equal(stream.stats().cursor, "1");
  } finally {
    abort.abort();
    nativeAbort.abort();
    await reader?.cancel().catch(() => undefined);
    stream.close();
    try {
      await proxy.stop(true);
    } finally {
      await backend.stop(true);
    }
  }
}

/**
 * Checks response-owned lifecycle cancellation in the actual Bun runtime.
 * @param ending - Response cancel, explicit request abort or native source close.
 * @returns Completion after a pending pull and its live feed retire.
 */
async function verifyResponse(
  ending: "cancel" | "abort" | "close" | "already-aborted",
): Promise<void> {
  const stream = createObservabilityStream();
  const abort = new AbortController();
  if (ending === "already-aborted") abort.abort();
  const response = streamResponse(
    stream,
    new Request("http://localhost", { signal: abort.signal }),
    1,
    100,
  );
  assert.ok(response.body);
  const reader = response.body.getReader();
  try {
    if (ending === "already-aborted") {
      assert.equal((await reader.read()).done, true);
      assert.equal(stream.stats().subscribers, 0);
      return;
    }
    await reader.read();
    const pending = reader.read();
    if (ending === "cancel") await reader.cancel();
    else if (ending === "abort") abort.abort();
    else stream.close();
    assert.equal((await pending).done, true);
    assert.equal(stream.stats().subscribers, 0);
    assert.equal(stream.stats().cursor, "0");
    assert.equal(stream.stats().published, 0);
  } finally {
    abort.abort();
    await reader.cancel();
    stream.close();
  }
}

await verifyProxy();
for (const ending of ["cancel", "abort", "close", "already-aborted"] as const)
  await verifyResponse(ending);
console.log("native SSE lifecycle verified");

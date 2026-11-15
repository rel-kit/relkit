/**
 * An answer waits for the unread rest of its request body only briefly: a client that stalls or
 * trickles its upload gets the answer and a closing connection, not a held response.
 */
import { expect, test } from "vitest";
import {
  UNREAD_BODY_DRAIN_MS,
  settleUnreadBody,
} from "../../src/runtime-hono/middleware-limits.js";

const LIMIT = 1024 * 1024;

/** A POST whose body sends one chunk and then never ends. */
function stalledRequest(): Request {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("partial"));
    },
  });
  return new Request("http://relkit.test/upload", {
    method: "POST",
    body,
    headers: { "content-length": "1000" },
    // Node requires it for a streamed request body.
    duplex: "half",
  } as RequestInit);
}

test("a stalled body is abandoned at the deadline and the connection closes", async () => {
  const startedAt = performance.now();
  const keepAlive = await settleUnreadBody(stalledRequest(), 401, LIMIT);
  const elapsed = performance.now() - startedAt;
  expect(keepAlive).toBe(false);
  expect(elapsed).toBeGreaterThanOrEqual(UNREAD_BODY_DRAIN_MS - 50);
  expect(elapsed).toBeLessThan(UNREAD_BODY_DRAIN_MS + 1_000);
});

test("a body that has arrived is drained and the connection stays open", async () => {
  const request = new Request("http://relkit.test/upload", { method: "POST", body: "complete" });
  expect(await settleUnreadBody(request, 401, LIMIT)).toBe(true);
});

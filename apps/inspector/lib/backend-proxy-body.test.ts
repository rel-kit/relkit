/** Exercises the browser-to-Node trust boundary before any forwarding can happen. */
import { expect, test } from "bun:test";
import { readInspectorProxyBody } from "./backend-proxy-body";

test("preserves bounded mutation bytes and rejects oversized declared or streamed bodies", async () => {
  expect(
    new TextDecoder().decode(
      await readInspectorProxyBody(
        new Request("http://ui", { method: "POST", body: '{"operationId":"same"}' }),
      ),
    ),
  ).toBe('{"operationId":"same"}');
  await expect(
    readInspectorProxyBody(
      new Request("http://ui", {
        method: "POST",
        body: "{}",
        headers: { "content-length": "1048577" },
      }),
    ),
  ).rejects.toThrow();
  let canceled = false;
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(1_048_577));
    },
    cancel() {
      canceled = true;
    },
  });
  await expect(
    readInspectorProxyBody(new Request("http://ui", { method: "POST", body, duplex: "half" })),
  ).rejects.toThrow();
  expect(canceled).toBe(true);
});

/** Exercises the browser-to-Node trust boundary before any forwarding can happen. */
import { expect, test } from "bun:test";
import { readInspectorProxyBody } from "./backend-proxy-body";

test("preserves bounded mutation bytes and rejects oversized declared or streamed bodies", async () => {
  expect(
    await new Response(
      await readInspectorProxyBody(
        new Request("http://ui/_relkit/backend/rpc", {
          method: "POST",
          body: '{"operationId":"same"}',
        }),
      ),
    ).text(),
  ).toBe('{"operationId":"same"}');
  await expect(
    readInspectorProxyBody(
      new Request("http://ui/_relkit/backend/rpc", {
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
    readInspectorProxyBody(
      new Request("http://ui/_relkit/backend/rpc", { method: "POST", body, duplex: "half" }),
    ),
  ).rejects.toThrow();
  expect(canceled).toBe(true);
});

test("streams application uploads without consuming or applying a control limit", async () => {
  const request = new Request("http://ui/_relkit/backend/uploads", {
    method: "POST",
    body: new Uint8Array(1_100_000),
  });
  const body = await readInspectorProxyBody(request);
  expect(body).toBe(request.body);
  expect(request.bodyUsed).toBe(false);
  expect((await new Response(body).arrayBuffer()).byteLength).toBe(1_100_000);
});

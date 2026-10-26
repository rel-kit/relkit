import { expect, test } from "bun:test";
import { createSupervisorProxy } from "../../src/proxy.js";

test("forwards large chunked uploads byte-for-byte through the stable generation proxy", async () => {
  const bytes = new Uint8Array(1_100_000).fill(73);
  const upstream = Bun.serve({
    port: 0,
    fetch: async (request) => new Response(await request.arrayBuffer()),
  });
  const proxy = createSupervisorProxy({ port: 0 });
  try {
    await proxy.listen();
    proxy.switchTarget({ token: { sourceToken: 1, generationToken: 1 }, port: upstream.port! });
    if (!proxy.url) throw new Error("Expected listening proxy");
    let offset = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset === bytes.length) controller.close();
        else {
          controller.enqueue(bytes.subarray(offset, offset + 55_000));
          offset += 55_000;
        }
      },
    });
    const response = await fetch(proxy.url, { method: "POST", body, duplex: "half" });
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  } finally {
    await proxy.stop();
    await upstream.stop(true);
  }
});

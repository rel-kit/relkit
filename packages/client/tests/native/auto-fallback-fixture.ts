import { strict as assert } from "node:assert";
import { oc } from "@orpc/contract";
import { createAutoClient } from "../../src/index.js";
import { connectSocket } from "../../src/transport-socket.js";

const schema = {
  "~standard": {
    version: 1 as const,
    vendor: "native-fallback-fixture",
    validate: (value: unknown) => ({ value }),
  },
};
const contract = { ping: oc.input(schema).output(schema) };
const failure = new DOMException("Socket blocked by browser policy.", "SecurityError");
let constructions = 0;

/** Native constructor seam reproducing a synchronous browser establishment rejection. */
class BlockedSocket extends WebSocket {
  /** @throws The original browser policy failure before allocating a connection. */
  constructor() {
    constructions++;
    super(
      (() => {
        throw failure;
      })(),
    );
  }
}

let requests = 0;
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch: async (request) => {
    assert.equal(new URL(request.url).pathname, "/rpc/ping");
    assert.equal(request.method, "POST");
    const body = await request.json();
    assert.deepEqual(body, { json: { message: "fallback" } });
    requests++;
    return Response.json({ json: "http-success" });
  },
});

try {
  const client = createAutoClient<typeof contract>({
    baseUrl: server.url.href,
    websocket: BlockedSocket,
  });
  assert.equal(constructions, 0, "transport selection must stay lazy");
  for (let call = 0; call < 2; call++)
    assert.equal(await client.ping({ message: "fallback" }), "http-success");
  assert.equal(constructions, 1, "future calls must reuse the selected HTTP fallback");
  assert.equal(requests, 2, "both calls must reach the real HTTP server");
  await assert.rejects(
    connectSocket(BlockedSocket, new URL("ws://localhost/rpc"), 1_000),
    (error) => error === failure,
  );
  assert.equal(requests, 2, "direct socket establishment must preserve its failure");
  console.log("native auto fallback: lazy selection, 2 HTTP results, original constructor error");
} finally {
  await server.stop(true);
}

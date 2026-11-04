import { afterEach, expect, it } from "vitest";
import { RPCLink } from "@orpc/client/fetch";
import { createClientTransport, selectAutoTransport } from "../../src/transport.service.js";
import { TestSocket } from "./socket-fixture.js";
import { connectSocket } from "../../src/transport-socket.js";

afterEach(() => {
  TestSocket.autoOpen = true;
  TestSocket.instances = [];
  TestSocket.created = Promise.withResolvers<TestSocket>();
});

it("socket constructor exceptions retain their identity", async () => {
  const failure = new DOMException("Socket blocked by browser policy.", "SecurityError");
  class BlockedSocket extends TestSocket {
    constructor() {
      super(
        (() => {
          throw failure;
        })(),
      );
    }
  }
  await expect(connectSocket(BlockedSocket, new URL("wss://localhost/rpc"), 1_000)).rejects.toBe(
    failure,
  );
});

it("establishment times out, closes the socket and falls back to HTTP", async () => {
  TestSocket.autoOpen = false;
  await expect(connectSocket(TestSocket, new URL("wss://localhost/rpc"), 5)).rejects.toMatchObject({
    name: "TimeoutError",
  });
  expect(TestSocket.instances[0]?.closes).toBe(1);
  const link = await selectAutoTransport({
    baseUrl: "http://localhost",
    websocket: TestSocket,
    establishmentTimeoutMs: 5,
  })(new AbortController().signal);
  expect(link).toBeInstanceOf(RPCLink);
  expect(TestSocket.instances[1]?.closes).toBe(1);
});

it("auto owner closure aborts pending actual socket callback acquisition", async () => {
  TestSocket.autoOpen = false;
  const transport = createClientTransport(
    selectAutoTransport({
      baseUrl: "http://localhost",
      websocket: TestSocket,
      establishmentTimeoutMs: 60_000,
    }),
  );
  const pending = transport.invoke([], undefined, { context: {} }).catch((error) => error);
  const socket = await TestSocket.created.promise;
  await transport.close();
  expect(await pending).toMatchObject({ name: "AbortError" });
  expect(socket.closes).toBe(1);
});

it("selected sockets remain owner-owned until their native SDK handoff", async () => {
  const select = selectAutoTransport({ baseUrl: "http://localhost", websocket: TestSocket });
  const unused = new AbortController();
  const link = await select(unused.signal);
  expect(link).not.toBeInstanceOf(RPCLink);
  unused.abort();
  expect(TestSocket.instances[0]?.closes).toBe(1);
  const transferred = new AbortController();
  const caller = new AbortController();
  try {
    const owned = await select(transferred.signal);
    const socket = TestSocket.instances[1]!;
    const pending = owned
      .call([], undefined, { context: {}, signal: caller.signal })
      .catch((error) => error);
    await socket.sent.promise;
    caller.abort();
    await pending;
    transferred.abort();
    expect(socket.closes).toBe(0);
  } finally {
    caller.abort();
    transferred.abort();
    TestSocket.instances[1]?.close();
  }
});

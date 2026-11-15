/**
 * RK-40 at the proxy hop on Node: the worker derives its request URL from `Host`, so the proxy's
 * upstream socket must deliver the public authority there, with the browser's cookies and
 * `Origin`. Node's global `WebSocket` replaces `Host`; the proxy's Node client keeps it. Frames
 * keep their kind (text or binary) in both directions and close codes cross the tunnel.
 */
import { Hono } from "hono";
import { nodeRuntime } from "relkit/runtime/node";
import type { RuntimeServer } from "relkit/runtime";
import { afterAll, beforeAll, expect, test } from "vitest";
import { WebSocket, type RawData } from "ws";
import { createSupervisorProxy, type SupervisorProxy } from "../../../src/supervisor/proxy.js";

let upstream: RuntimeServer;
let proxy: SupervisorProxy;
let origin = "";
const closes: { code: number; reason: string }[] = [];

beforeAll(async () => {
  const app = new Hono();
  app.get(
    "*",
    nodeRuntime.upgradeWebSocket((context) => ({
      onOpen: (_event, socket) => {
        const request = context.req.raw;
        socket.send(
          JSON.stringify({
            url: request.url,
            host: request.headers.get("host"),
            origin: request.headers.get("origin"),
            cookie: request.headers.get("cookie"),
            forwardedHost: request.headers.get("x-forwarded-host"),
          }),
        );
      },
      onMessage: (event, socket) => {
        if (event.data === "close") socket.close(4001, "worker done");
        else if (typeof event.data === "string") socket.send(`text:${event.data}`);
        else socket.send(new Uint8Array([...new Uint8Array(event.data as ArrayBuffer), 255]));
      },
      onClose: (event) => {
        closes.push({ code: event.code, reason: event.reason });
      },
    })),
  );
  upstream = await nodeRuntime.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request, bindings) => app.fetch(request, bindings),
  });
  proxy = createSupervisorProxy({ port: 0 });
  await proxy.listen();
  proxy.switchTarget({ token: { sourceToken: 1, generationToken: 1 }, port: upstream.port });
  origin = `http://127.0.0.1:${proxy.port}`;
});

afterAll(async () => {
  await proxy.stop();
  await upstream.stop(true);
});

/** One received frame with its kind. */
interface Frame {
  readonly binary: boolean;
  readonly data: RawData;
}

/**
 * Opens a client socket through the proxy and queues what it receives.
 * @param headers - Handshake headers a browser would send.
 * @returns The open socket, the next-frame reader and its close event.
 */
async function connect(headers: Record<string, string>) {
  const socket = new WebSocket(`${origin.replace("http", "ws")}/socket`, { headers });
  const frames: Frame[] = [];
  const waiting: ((frame: Frame) => void)[] = [];
  socket.on("message", (data, binary) => {
    const frame = { data, binary };
    const next = waiting.shift();
    if (next === undefined) frames.push(frame);
    else next(frame);
  });
  const closed = new Promise<{ code: number; reason: string }>((resolve) =>
    socket.on("close", (code, reason) => resolve({ code, reason: reason.toString() })),
  );
  await new Promise<void>((resolve, reject) => {
    socket.once("open", () => resolve());
    socket.once("error", reject);
  });
  const next = (): Promise<Frame> =>
    frames.length > 0
      ? Promise.resolve(frames.shift()!)
      : new Promise((resolve) => waiting.push(resolve));
  return { socket, next, closed };
}

test("the worker sees the public origin, cookies and Origin of a socket upgrade", async () => {
  const client = await connect({
    origin,
    cookie: "session=abc",
    "x-forwarded-host": "attacker.example",
  });
  const seen = JSON.parse(String((await client.next()).data)) as Record<string, string>;
  expect(new URL(seen.url!).origin).toBe(origin);
  expect(seen).toMatchObject({
    host: `127.0.0.1:${proxy.port}`,
    origin,
    cookie: "session=abc",
  });
  // Client forwarding headers are not forwarded, and never decide the authority.
  expect(seen.forwardedHost).toBeNull();
  client.socket.close(1000);
  await client.closed;
});

test("text and binary frames keep their kind in both directions", async () => {
  const client = await connect({ origin });
  await client.next();
  client.socket.send("hello");
  const text = await client.next();
  expect({ binary: text.binary, data: String(text.data) }).toEqual({
    binary: false,
    data: "text:hello",
  });
  client.socket.send(new Uint8Array([1, 2, 3]));
  const binary = await client.next();
  expect(binary.binary).toBe(true);
  expect([...new Uint8Array(binary.data as Buffer)]).toEqual([1, 2, 3, 255]);
  client.socket.close(1000);
  await client.closed;
});

test("close codes cross the tunnel in both directions", async () => {
  const fromWorker = await connect({ origin });
  await fromWorker.next();
  fromWorker.socket.send("close");
  expect(await fromWorker.closed).toEqual({ code: 4001, reason: "worker done" });

  const fromClient = await connect({ origin });
  await fromClient.next();
  closes.length = 0;
  fromClient.socket.close(4002, "client done");
  await fromClient.closed;
  await expect.poll(() => closes.at(-1)).toEqual({ code: 4002, reason: "client done" });
});

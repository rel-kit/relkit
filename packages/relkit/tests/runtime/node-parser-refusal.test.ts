/**
 * Node's HTTP parser refuses some requests before any handler runs. The adapter writes the 431
 * for oversized headers itself, so that answer carries a request ID; every other refusal keeps
 * the bytes a plain `node:http` server writes.
 */
import { createServer } from "node:http";
import { connect, type AddressInfo } from "node:net";
import { expect, test } from "vitest";
import { serve } from "../../src/runtime/node/serve.js";

/** Sends raw bytes and resolves with everything the server wrote before it closed. */
function exchange(port: number, payload: string): Promise<string> {
  return new Promise((resolve) => {
    const socket = connect(port, "127.0.0.1");
    let received = "";
    socket.on("data", (chunk: Buffer) => {
      received += chunk.toString("latin1");
    });
    socket.on("error", () => resolve(received));
    socket.on("close", () => resolve(received));
    socket.on("connect", () => socket.write(payload));
  });
}

/** One header line over Node's 16 KB limit, sent in one write so nothing is left unread. */
const OVERSIZED = `GET /hello HTTP/1.1\r\nHost: test\r\nx-big: ${"a".repeat(17_000)}`;

test("oversized headers are answered 431 with a request ID, without reaching the handler", async () => {
  let handled = 0;
  const server = await serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => {
      handled += 1;
      return new Response("handled");
    },
  });
  try {
    const first = await exchange(server.port, OVERSIZED);
    const second = await exchange(server.port, OVERSIZED);
    expect(first.startsWith("HTTP/1.1 431 Request Header Fields Too Large\r\n")).toBe(true);
    expect(first).toMatch(/\r\nConnection: close\r\n/);
    expect(first.endsWith("\r\n\r\n")).toBe(true);
    const id = /\r\nx-request-id: (request-[0-9a-f-]{36})\r\n/.exec(first)?.[1];
    expect(id).toBeDefined();
    expect(/\r\nx-request-id: (request-[0-9a-f-]{36})\r\n/.exec(second)?.[1]).not.toBe(id);
    expect(handled).toBe(0);
  } finally {
    await server.stop(true);
  }
}, 15_000);

test("a malformed request keeps the answer a plain node:http server writes", async () => {
  const plain = createServer(() => undefined);
  await new Promise<void>((resolve) => plain.listen(0, "127.0.0.1", () => resolve()));
  const server = await serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response("handled"),
  });
  try {
    const malformed = "NOT A REQUEST LINE\r\n\r\n";
    const expected = await exchange((plain.address() as AddressInfo).port, malformed);
    expect(expected.startsWith("HTTP/1.1 400 Bad Request\r\n")).toBe(true);
    expect(await exchange(server.port, malformed)).toBe(expected);
  } finally {
    await server.stop(true);
    await new Promise<void>((resolve) => plain.close(() => resolve()));
  }
}, 15_000);

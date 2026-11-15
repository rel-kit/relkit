/**
 * A connection the Node listener is closing keeps reading for a short while, so the client can
 * read the answer (RK-42). A request that arrives on it in that time must not reach the handler:
 * its answer could never be delivered, and the client would send it again elsewhere.
 */
import { connect } from "node:net";
import { expect, test } from "vitest";
import { serve } from "../../src/runtime/node/serve.js";

test("a request sent on a closing connection is not handled", async () => {
  const handled: string[] = [];
  const server = await serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request) => {
      const path = new URL(request.url).pathname;
      handled.push(path);
      return path === "/refuse"
        ? new Response("refused", { status: 413, headers: { connection: "close" } })
        : new Response("counted");
    },
  });
  try {
    const socket = connect(server.port, "127.0.0.1");
    let received = "";
    const closed = new Promise<void>((resolve) => socket.once("close", () => resolve()));
    const answered = new Promise<void>((resolve) => {
      socket.on("data", (chunk: Buffer) => {
        received += chunk.toString("latin1");
        if (received.includes("refused")) resolve();
      });
    });
    await new Promise<void>((resolve) => socket.once("connect", () => resolve()));
    // The body is declared but only partly sent, so the server answers while it is still due.
    socket.write("POST /refuse HTTP/1.1\r\nHost: test\r\nContent-Length: 10\r\n\r\n01234");
    await answered;
    socket.write("56789POST /count HTTP/1.1\r\nHost: test\r\nContent-Length: 0\r\n\r\n");
    await new Promise((resolve) => setTimeout(resolve, 300));
    socket.end();
    await closed;
    expect(received).toContain("HTTP/1.1 413");
    expect(received).not.toContain("counted");
    expect(handled).toEqual(["/refuse"]);
  } finally {
    await server.stop(true);
  }
}, 15_000);

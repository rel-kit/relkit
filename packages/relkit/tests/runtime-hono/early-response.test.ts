/**
 * RK-01: an answer sent before the request body was read must leave the connection usable. The
 * runtime consumes the unread body up to the body limit, or answers with `Connection: close`.
 */
import { connect } from "node:net";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { instrumentHttpRequest } from "../../src/runtime-hono/http-span.js";
import { nodeRuntime } from "../../src/runtime/node/index.js";
import type { RuntimeServer } from "../../src/runtime/index.js";
import { startBunFixture, type BunFixture } from "./bun-fixture.ts";
import { EARLY_RESPONSE_LIMIT, earlyResponseHandler } from "./early-response-app.ts";

/** A request body that records how much of it was pulled. */
function trackedBody(size: number, chunk = 256) {
  const state = { pulled: 0, done: false, cancelled: false };
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        if (state.pulled >= size) {
          state.done = true;
          controller.close();
          return;
        }
        const next = Math.min(chunk, size - state.pulled);
        state.pulled += next;
        controller.enqueue(new Uint8Array(next).fill(120));
      },
      cancel() {
        state.cancelled = true;
      },
    },
    { highWaterMark: 0 },
  );
  return { state, stream };
}

/** Builds a POST whose body is streamed, optionally with a declared length. */
function post(body: ReadableStream<Uint8Array>, length?: number): Request {
  return new Request("http://localhost/write", {
    method: "POST",
    body,
    duplex: "half",
    ...(length === undefined ? {} : { headers: { "content-length": String(length) } }),
  } as RequestInit);
}

const denied = () => new Response("denied", { status: 403 });

describe("instrumentHttpRequest after an early answer", () => {
  test("consumes an unread body within the limit and keeps the connection", async () => {
    const { state, stream } = trackedBody(900);
    const response = await instrumentHttpRequest(post(stream), { maxBodyBytes: 1024 }, denied);
    expect(response.status).toBe(403);
    expect(state.done).toBe(true);
    expect(response.headers.get("connection")).toBeNull();
    expect(response.headers.get("x-request-id")).toMatch(/^request-/);
  });

  test("closes the connection when the unread body exceeds the limit", async () => {
    const { state, stream } = trackedBody(4096);
    const response = await instrumentHttpRequest(post(stream), { maxBodyBytes: 1024 }, denied);
    expect(response.status).toBe(403);
    expect(response.headers.get("connection")).toBe("close");
    expect(state.done).toBe(false);
    expect(state.pulled).toBeLessThanOrEqual(1024 + 256);
  });

  test("closes without reading when the declared length exceeds the limit", async () => {
    const { state, stream } = trackedBody(4096);
    const response = await instrumentHttpRequest(
      post(stream, 4096),
      { maxBodyBytes: 1024 },
      denied,
    );
    expect(response.headers.get("connection")).toBe("close");
    expect(state.pulled).toBe(0);
  });

  test("closes the connection when no body limit is configured", async () => {
    const { state, stream } = trackedBody(10);
    const response = await instrumentHttpRequest(post(stream), {}, denied);
    expect(response.headers.get("connection")).toBe("close");
    expect(state.pulled).toBe(0);
  });

  test("leaves a body the handler read alone", async () => {
    const { stream } = trackedBody(10);
    const response = await instrumentHttpRequest(
      post(stream),
      { maxBodyBytes: 1024 },
      async (request) => new Response(String((await request.arrayBuffer()).byteLength)),
    );
    expect(await response.text()).toBe("10");
    expect(response.headers.get("connection")).toBeNull();
  });
});

/** One early answer and the request that sends it. */
interface EarlyCase {
  readonly name: string;
  readonly status: number;
  readonly head: (port: number) => string;
  readonly body: string;
}

const json = JSON.stringify({ name: "x".repeat(300) });
const sameOrigin = (port: number) => `Origin: http://127.0.0.1:${port}\r\n`;
const postHead = (path: string, origin: string, length: number) =>
  `POST ${path} HTTP/1.1\r\nHost: HOST\r\n${origin}Content-Type: application/json\r\nContent-Length: ${length}\r\n\r\n`;

const cases: readonly EarlyCase[] = [
  {
    name: "origin denied",
    status: 403,
    head: () => postHead("/write", "Origin: http://evil.test\r\n", json.length),
    body: json,
  },
  {
    name: "unknown route",
    status: 404,
    head: (p) => postHead("/missing", sameOrigin(p), json.length),
    body: json,
  },
  {
    name: "wrong method",
    status: 405,
    head: (p) => postHead("/ok", sameOrigin(p), json.length),
    body: json,
  },
  {
    name: "route-level 401",
    status: 401,
    head: (p) => postHead("/private", sameOrigin(p), json.length),
    body: json,
  },
  {
    name: "not ready",
    status: 503,
    head: (p) => postHead("/not-ready", sameOrigin(p), json.length),
    body: json,
  },
];

/**
 * Sends one request whose body arrives after its headers, then `GET /ok` on the same socket.
 * @returns The raw bytes the server wrote before it closed or went quiet.
 */
async function exchange(
  port: number,
  head: string,
  body: string,
  follow: boolean,
): Promise<string> {
  const socket = connect(port, "127.0.0.1");
  let received = "";
  let closed = false;
  socket.on("data", (data) => (received += data.toString()));
  socket.on("error", () => undefined);
  const ended = new Promise<void>((resolve) =>
    socket.on("close", () => ((closed = true), resolve())),
  );
  await new Promise<void>((resolve) => socket.once("connect", () => resolve()));
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  socket.write(head.replace("HOST", `127.0.0.1:${port}`));
  await wait(20);
  socket.write(body.slice(0, Math.floor(body.length / 2)));
  await wait(10);
  socket.write(body.slice(Math.floor(body.length / 2)));
  if (follow) socket.write(`GET /ok HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n\r\n`);
  const deadline = Date.now() + 3_000;
  while (!closed && Date.now() < deadline) {
    const second = received.indexOf("HTTP/1.1 ", 1);
    if (follow && second > 0 && received.indexOf('{"ok":true}', second) > 0) break;
    await wait(10);
  }
  socket.destroy();
  await ended;
  return received;
}

/** Splits the raw exchange into its responses' status lines and headers. */
function responses(raw: string): { status: number; headers: string }[] {
  return raw
    .split(/(?=HTTP\/1\.1 \d{3})/)
    .filter((part) => part.startsWith("HTTP/1.1 "))
    .map((part) => ({
      status: Number(part.slice(9, 12)),
      headers: part.split("\r\n\r\n")[0]!.toLowerCase(),
    }));
}

for (const adapter of ["node", "bun"] as const) {
  describe(`served on the ${adapter} adapter`, () => {
    let port = 0;
    let server: RuntimeServer | undefined;
    let fixture: BunFixture | undefined;
    beforeAll(async () => {
      if (adapter === "bun") {
        fixture = await startBunFixture("early-response");
        port = fixture.port;
      } else {
        server = await nodeRuntime.serve({
          hostname: "127.0.0.1",
          port: 0,
          fetch: earlyResponseHandler(),
        });
        port = server.port;
      }
    }, 20_000);
    afterAll(async () => {
      await server?.stop(true);
      await fixture?.stop();
    });

    for (const early of cases)
      test(`${early.name}: the next request on the connection gets its normal answer`, async () => {
        for (let attempt = 0; attempt < 5; attempt++) {
          const [first, second] = responses(
            await exchange(port, early.head(port), early.body, true),
          );
          expect(first?.status).toBe(early.status);
          expect(second?.status).toBe(200);
          expect(second?.headers).toContain("x-request-id: request-");
        }
      });

    test("413: the oversize answer closes the connection", async () => {
      const big = "x".repeat(EARLY_RESPONSE_LIMIT * 4);
      const raw = await exchange(
        port,
        postHead("/write", sameOrigin(port), big.length),
        big,
        false,
      );
      const [first, ...rest] = responses(raw);
      expect(first?.status).toBe(413);
      expect(first?.headers).toContain("connection: close");
      expect(rest).toEqual([]);
    });

    test("a Node fetch client sees no bare 400 after early answers", async () => {
      for (let attempt = 0; attempt < 30; attempt++) {
        const denied = await fetch(`http://127.0.0.1:${port}/write`, {
          method: "POST",
          headers: { origin: "http://evil.test", "content-type": "application/json" },
          body: JSON.stringify({ attempt, name: "x".repeat(600) }),
        });
        await denied.arrayBuffer();
        const next = await fetch(`http://127.0.0.1:${port}/ok`);
        expect([denied.status, next.status]).toEqual([403, 200]);
        expect(next.headers.get("x-request-id")).toMatch(/^request-/);
        await next.arrayBuffer();
      }
    });
  });
}

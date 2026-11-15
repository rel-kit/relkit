/**
 * RK-40: a real `relkit dev`, run by Node and by Bun, judges a WebSocket's `Origin` against the
 * origin the client used (the development front), not the worker's private port, and forwarding
 * headers sent by the client do not change that verdict. The handshake is sent raw, as a browser
 * would send it, so the test reads the exact status the development server answers.
 */
import { connect } from "node:net";
import { afterAll, expect, test } from "bun:test";
import { createDevFixture, startDev } from "./dev-reload.fixture.js";
import type { DevProcess } from "./dev-reload.fixture.types.js";

const fixture = createDevFixture();
let running: DevProcess | undefined;

afterAll(async () => {
  await running?.stop();
  fixture.remove();
}, 60_000);

const RPC = "/_relkit/v1/rpc";
const CROSS_ORIGIN = "http://attacker.example";
const SPOOFED = {
  "x-forwarded-host": "attacker.example",
  "x-forwarded-proto": "http",
  forwarded: "host=attacker.example;proto=http",
};

/**
 * Sends one WebSocket handshake to the development server and reads its status line.
 * @param dev - Running development server.
 * @param headers - Extra handshake headers, such as `Origin`.
 * @returns The answered HTTP status.
 */
function handshake(dev: DevProcess, headers: Record<string, string>): Promise<number> {
  const url = new URL(dev.origin);
  const lines = [
    `GET ${RPC} HTTP/1.1`,
    `Host: ${url.host}`,
    "Upgrade: websocket",
    "Connection: Upgrade",
    "Sec-WebSocket-Version: 13",
    `Sec-WebSocket-Key: ${Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64")}`,
    ...Object.entries(headers).map(([name, value]) => `${name}: ${value}`),
  ];
  return new Promise((resolve, reject) => {
    const socket = connect(Number(url.port), url.hostname);
    let head = "";
    socket.setTimeout(10_000, () => socket.destroy(new Error("Handshake timed out.")));
    socket.on("error", reject);
    socket.on("data", (chunk) => {
      head += chunk.toString("latin1");
      const match = /^HTTP\/1\.1 (\d{3})/.exec(head);
      if (match === null) return;
      socket.destroy();
      resolve(Number(match[1]));
    });
    socket.write(`${lines.join("\r\n")}\r\n\r\n`);
  });
}

/**
 * Opens a client socket to the RPC endpoint and waits for it to open or fail.
 * @param dev - Running development server.
 * @param origin - Origin the client announces.
 * @returns Whether the socket opened.
 */
function opens(dev: DevProcess, origin: string): Promise<boolean> {
  const socket = new WebSocket(`${dev.origin.replace("http", "ws")}${RPC}`, {
    headers: { origin },
  });
  return new Promise((resolve) => {
    socket.addEventListener("open", () => {
      resolve(true);
      socket.close(1000);
    });
    socket.addEventListener("error", () => resolve(false));
    socket.addEventListener("close", () => resolve(false));
  });
}

for (const host of ["node", "bun"] as const) {
  test(
    `relkit dev on ${host} accepts same-origin WebSockets and refuses cross-origin ones`,
    async () => {
      await running?.stop();
      running = await startDev(fixture.root, true, [], host);
      const dev = running;
      await dev.waitFor("/a1", "a1 v0");

      const same = await handshake(dev, { Origin: dev.origin });
      expect(same, dev.output().slice(-3_000)).toBe(101);
      expect(await opens(dev, dev.origin)).toBe(true);
      const cross = await handshake(dev, { Origin: CROSS_ORIGIN });
      // The worker's refusal, not a 502 from the development proxy (finding 7b).
      expect(cross).toBe(403);
      expect(await opens(dev, CROSS_ORIGIN)).toBe(false);
      // Client-sent forwarding headers neither admit a foreign origin nor deny the real one.
      expect(await handshake(dev, { Origin: CROSS_ORIGIN, ...SPOOFED })).toBe(cross);
      expect(await handshake(dev, { Origin: dev.origin, ...SPOOFED })).toBe(101);
    },
    { timeout: 300_000 },
  );
}

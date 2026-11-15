/**
 * Finding 7b through the development proxy on Node: an upgrade the worker refuses is answered
 * with the worker's own status, content type and request id, not with 502. Hono's Node server
 * answers a refused upgrade with `Content-Length: 0`, so the Problem body does not reach the
 * client on Node (the proxy hands it on; the listener drops it).
 */
import { afterAll, beforeAll, expect, test } from "vitest";
import { handshake, startRefusingProxy } from "./refused-upgrade.fixture.ts";

let running: Awaited<ReturnType<typeof startRefusingProxy>>;

beforeAll(async () => {
  running = await startRefusingProxy();
});

afterAll(async () => {
  await running.stop();
});

test("a foreign Origin gets the worker's 403 with its request id", async () => {
  const answer = await handshake(running.origin, "/socket", { Origin: "http://attacker.example" });
  expect(answer.status).toBe(403);
  expect(answer.headers).toMatchObject({
    "content-type": "application/problem+json",
    "x-request-id": "request-worker",
  });
});

test("another refusal keeps the worker's status", async () => {
  const answer = await handshake(running.origin, "/socket?locked", { Origin: running.origin });
  expect(answer.status).toBe(401);
  expect(answer.headers["x-request-id"]).toBe("request-worker");
});

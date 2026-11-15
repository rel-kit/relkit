/**
 * Finding 7b through the development proxy on Bun, whose WebSocket client reports no status for
 * a refused handshake: the proxy refuses a foreign `Origin` itself with 403 `origin-denied`, and
 * answers any other refusal with a 502 Problem; both carry a request id.
 */
import { afterAll, beforeAll, expect, test } from "bun:test";
import { handshake, startRefusingProxy } from "./refused-upgrade.fixture.ts";

let running: Awaited<ReturnType<typeof startRefusingProxy>>;

beforeAll(async () => {
  running = await startRefusingProxy();
});

afterAll(async () => {
  await running.stop();
});

for (const [name, path, origin, status, code] of [
  ["a foreign Origin is refused with 403", "/socket", "http://attacker.example", 403, "origin-denied"],
  ["an opaque Origin is refused with 403", "/socket", "null", 403, "origin-denied"],
  ["another refusal is a 502 Problem", "/socket?locked", undefined, 502, "upstream-unavailable"],
] as const)
  test(name, async () => {
    const answer = await handshake(running.origin, path, {
      Origin: origin ?? running.origin,
    });
    expect(answer.status).toBe(status);
    expect(answer.headers["content-type"]).toBe("application/problem+json");
    const body = JSON.parse(answer.body) as { code: string; requestId: string };
    expect(body.code).toBe(code);
    expect(answer.headers["x-request-id"]).toBe(body.requestId);
  });

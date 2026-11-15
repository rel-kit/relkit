import { afterAll, beforeAll, expect, test } from "bun:test";
import { bunRuntime } from "relkit/runtime/bun";
import { burst, closeAfter, MALFORMED_FRAMES } from "./rpc-websocket-hygiene.case.ts";
import { firstFrame, foreignHandshake, startSessionGuardServer } from "./realtime-session-guard.case.ts";

let server: Awaited<ReturnType<typeof startSessionGuardServer>>;
beforeAll(async () => {
  server = await startSessionGuardServer(bunRuntime);
});
afterAll(() => server.close());

test("on Bun, a session guard serves its own company over HTTP and over a WebSocket", async () => {
  expect(await firstFrame(server.http, "acme")).toBe("caught-up");
  expect(await firstFrame(server.socket, "acme")).toBe("caught-up");
  expect(await firstFrame(server.http, "globex")).toBe("NOT_FOUND");
  expect(await firstFrame(server.socket, "globex")).toBe("NOT_FOUND");
});

test("on Bun, an upgrade from a foreign origin is refused with 403 origin-denied", async () => {
  const answer = await foreignHandshake(server.origin);
  expect(answer.status).toBe(403);
  expect(answer.raw).toContain("content-type: application/problem+json");
  expect(answer.raw).toMatch(/x-request-id: request-/u);
  expect(answer.raw).toContain('"code":"origin-denied"');
});

for (const [name, frame] of MALFORMED_FRAMES)
  test(`on Bun, ${name} closes the socket as invalid data`, async () => {
    expect((await closeAfter(server.origin, frame)).code).toBe(1007);
  });

test("on Bun, a burst of 300 valid frames is answered on an open socket", async () => {
  expect(await burst(server.origin, 300)).toEqual({ answers: 300, open: true });
});

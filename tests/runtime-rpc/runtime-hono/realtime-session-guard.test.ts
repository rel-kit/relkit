import { afterAll, beforeAll, expect, test } from "vitest";
import { nodeRuntime } from "relkit/runtime/node";
import { burst, closeAfter, MALFORMED_FRAMES } from "./rpc-websocket-hygiene.case.ts";
import {
  firstFrame,
  foreignHandshake,
  startSessionGuardServer,
} from "./realtime-session-guard.case.ts";

let server: Awaited<ReturnType<typeof startSessionGuardServer>>;
beforeAll(async () => {
  server = await startSessionGuardServer(nodeRuntime);
});
afterAll(() => server.close());

test("on Node, a session guard serves its own company over HTTP and over a WebSocket", async () => {
  expect(await firstFrame(server.http, "acme")).toBe("caught-up");
  expect(await firstFrame(server.socket, "acme")).toBe("caught-up");
  expect(await firstFrame(server.http, "globex")).toBe("NOT_FOUND");
  expect(await firstFrame(server.socket, "globex")).toBe("NOT_FOUND");
});

// Hono's Node server sends a refused upgrade's status and headers without its body.
test("on Node, an upgrade from a foreign origin is refused with 403 origin-denied", async () => {
  const answer = await foreignHandshake(server.origin);
  expect(answer.status).toBe(403);
  expect(answer.raw).toContain("content-type: application/problem+json");
  expect(answer.raw).toMatch(/x-request-id: request-/u);
});

for (const [name, frame] of MALFORMED_FRAMES)
  test(`on Node, ${name} closes the socket as invalid data`, async () => {
    expect((await closeAfter(server.origin, frame)).code).toBe(1007);
  });

test("on Node, a burst of 300 valid frames is answered on an open socket", async () => {
  expect(await burst(server.origin, 300)).toEqual({ answers: 300, open: true });
});

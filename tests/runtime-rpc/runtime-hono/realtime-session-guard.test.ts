import { afterAll, beforeAll, expect, test } from "vitest";
import { nodeRuntime } from "relkit/runtime/node";
import { firstFrame, foreignHandshake, startSessionGuardServer } from "./realtime-session-guard.case.ts";

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

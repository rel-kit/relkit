import { afterAll, beforeAll, expect, test } from "vitest";
import { nodeRuntime } from "relkit/runtime/node";
import { firstFrame, startSessionGuardServer } from "./realtime-session-guard.case.ts";

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

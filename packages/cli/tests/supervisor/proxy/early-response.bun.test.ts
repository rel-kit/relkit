/**
 * RK-01 through the development proxy on Bun: when the worker answers before the request body
 * reached it, Bun's fetch stops sending the body but pools the connection, and the worker reads
 * the next request as the rest of the body and answers a bare 400. The proxy must not reuse it.
 */
import { afterAll, beforeAll, expect, test } from "bun:test";
import { createSupervisorProxy, type SupervisorProxy } from "../../../src/supervisor/proxy.js";
import {
  earlyWorker,
  lateBodyExchange,
  NODE_FETCH_CLIENT,
  statusCodes,
  type EchoRecord,
} from "./early-response.fixture.ts";

let upstream: Bun.Server<undefined>;
let proxy: SupervisorProxy;
let port = 0;
const seen: EchoRecord[] = [];

beforeAll(async () => {
  upstream = Bun.serve({ port: 0, fetch: (request) => earlyWorker(request, seen) });
  proxy = createSupervisorProxy({ port: 0 });
  await proxy.listen();
  proxy.switchTarget({ token: { sourceToken: 1, generationToken: 1 }, port: upstream.port! });
  port = proxy.port;
});

afterAll(async () => {
  await proxy.stop();
  await upstream.stop(true);
});

for (const framing of ["length", "chunked"] as const)
  test(`a request after an early 403 with a late ${framing} body gets its normal answer`, async () => {
    for (let attempt = 0; attempt < 5; attempt++)
      expect(statusCodes(await lateBodyExchange(port, framing))).toEqual(["403", "200"]);
  });

test("an early answer to a body still arriving tells the client to close", async () => {
  const raw = await lateBodyExchange(port, "chunked");
  expect(raw.split("\r\n\r\n")[0]!.toLowerCase()).toContain("connection: close");
});

// Bun's own fetch client mishandles an early answer to a streamed body on any server, so the
// audit's Node client is used.
test("Node fetch requests after early answers never see a bare 400", async () => {
  const child = Bun.spawn(
    ["node", "--input-type=module", "-e", NODE_FETCH_CLIENT, String(port), "60"],
    { stdout: "pipe", stderr: "inherit" },
  );
  const statuses = JSON.parse(await new Response(child.stdout).text()) as string[];
  expect(await child.exited).toBe(0);
  expect(statuses).toEqual(Array.from({ length: 60 }, () => "403>200:r"));
}, 30_000);

test("the client's Content-Length reaches the worker and the body arrives whole", async () => {
  seen.length = 0;
  const payload = "y".repeat(70_000);
  const response = await fetch(`http://127.0.0.1:${port}/echo`, { method: "POST", body: payload });
  expect(await response.json()).toEqual({ bytes: payload.length });
  expect(seen).toEqual([{ length: String(payload.length), bytes: payload.length }]);
});

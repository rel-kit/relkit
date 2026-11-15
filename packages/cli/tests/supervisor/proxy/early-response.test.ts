/**
 * RK-01 through the development proxy on Node: the same early-answer reproduction as the Bun
 * suite, with the Node listener and Node's fetch forwarding to a Node worker.
 */
import { spawn } from "node:child_process";
import { nodeRuntime } from "relkit/runtime/node";
import type { RuntimeServer } from "relkit/runtime";
import { afterAll, beforeAll, expect, test } from "vitest";
import { createSupervisorProxy, type SupervisorProxy } from "../../../src/supervisor/proxy.js";
import {
  earlyWorker,
  lateBodyExchange,
  NODE_FETCH_CLIENT,
  statusCodes,
  type EchoRecord,
} from "./early-response.fixture.ts";

let upstream: RuntimeServer;
let proxy: SupervisorProxy;
let port = 0;
const seen: EchoRecord[] = [];

beforeAll(async () => {
  upstream = await nodeRuntime.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request) => earlyWorker(request, seen),
  });
  proxy = createSupervisorProxy({ port: 0 });
  await proxy.listen();
  proxy.switchTarget({ token: { sourceToken: 1, generationToken: 1 }, port: upstream.port });
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

test("Node fetch requests after early answers never see a bare 400", async () => {
  const child = spawn(
    process.execPath,
    ["--input-type=module", "-e", NODE_FETCH_CLIENT, String(port), "60"],
    { stdio: ["ignore", "pipe", "inherit"] },
  );
  let output = "";
  child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
  const code = await new Promise<number | null>((resolve) => child.on("close", resolve));
  expect(code).toBe(0);
  expect(JSON.parse(output)).toEqual(Array.from({ length: 60 }, () => "403>200:r"));
}, 30_000);

test("the client's Content-Length reaches the worker and the body arrives whole", async () => {
  seen.length = 0;
  const payload = "y".repeat(70_000);
  const response = await fetch(`http://127.0.0.1:${port}/echo`, { method: "POST", body: payload });
  expect(await response.json()).toEqual({ bytes: payload.length });
  expect(seen).toEqual([{ length: String(payload.length), bytes: payload.length }]);
});

/**
 * RK-42 through the development proxy on Bun: every body over the limit streamed by Node's
 * `fetch` or `node:http` gets the worker's 413 `payload-too-large` with a request id within 5 s,
 * never a proxy-made 500 or a hang, and the next request on a kept-alive connection is served.
 */
import { afterAll, beforeAll, expect, test } from "bun:test";
import { runOversizeClient, startOversizeProxy } from "./oversize-stream.fixture.ts";

let running: Awaited<ReturnType<typeof startOversizeProxy>>;

beforeAll(async () => {
  running = await startOversizeProxy();
});

afterAll(async () => {
  await running.stop();
});

for (const mode of ["fetch", "http"] as const)
  test(`oversize bodies sent with ${mode} get 413 every time`, async () => {
    const tally = await runOversizeClient(`http://127.0.0.1:${running.port}`, mode, 50);
    expect(tally).toEqual({
      ok: 150,
      failures: {},
      followUpFailures: {},
      slowestMs: tally.slowestMs,
    });
    expect(tally.slowestMs).toBeLessThan(5_000);
  }, 300_000);

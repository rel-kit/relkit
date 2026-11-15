/**
 * RK-41 through the development proxy on Bun: a request whose client declared no body reaches
 * the worker's handler without one, and the proxy adds no body or `Transfer-Encoding`.
 */
import { afterAll, beforeAll, expect, test } from "bun:test";
import { BODYLESS_CASES, bodylessExchange, startBodylessProxy } from "./bodyless.fixture.ts";

let running: Awaited<ReturnType<typeof startBodylessProxy>>;

beforeAll(async () => {
  running = await startBodylessProxy();
});

afterAll(async () => {
  await running.stop();
});

for (const testCase of BODYLESS_CASES)
  test(`${testCase.name} reaches the worker as sent`, async () => {
    expect(await bodylessExchange(running.port, testCase)).toMatchObject(testCase.expected);
  });

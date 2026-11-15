/**
 * Request bodies under a real `relkit dev`, run by Node and by Bun. RK-41: a request whose client
 * declared no body reaches the route's handler without one. RK-42: bodies over the limit streamed
 * by Node's `fetch` and `node:http` get the worker's 413 every time, and the next request on a
 * kept-alive connection is served.
 */
import { afterAll, expect, test } from "bun:test";
import { BODYLESS_CASES, bodylessExchange } from "../supervisor/proxy/bodyless.fixture.ts";
import { runOversizeClient } from "../supervisor/proxy/oversize-stream.fixture.ts";
import { createDevFixture, startDev } from "./dev-reload.fixture.js";
import type { DevProcess } from "./dev-reload.fixture.types.js";

const fixture = createDevFixture();
fixture.write(
  "src/routes/body/route.ts",
  `import { defineRoute } from "relkit";

const report = async (request: Request) => {
  const bodyNull = request.body === null;
  return Response.json({
    method: request.method,
    bodyNull,
    contentLength: request.headers.get("content-length"),
    transferEncoding: request.headers.get("transfer-encoding"),
    text: bodyNull ? null : await request.text(),
  });
};

export const POST = defineRoute({ handler: report });
export const PATCH = defineRoute({ handler: report });
export const DELETE = defineRoute({ handler: report });
`,
);
let running: DevProcess | undefined;

afterAll(async () => {
  await running?.stop();
  fixture.remove();
}, 60_000);

for (const host of ["node", "bun"] as const) {
  test(
    `relkit dev on ${host} delivers request bodies as the client sent them`,
    async () => {
      await running?.stop();
      running = await startDev(fixture.root, true, [], host);
      const dev = running;
      await dev.waitFor("/a1", "a1 v0");
      const port = Number(new URL(dev.origin).port);
      for (const testCase of BODYLESS_CASES)
        expect(await bodylessExchange(port, testCase), testCase.name).toMatchObject(
          testCase.expected,
        );
      for (const mode of ["fetch", "http"] as const) {
        const tally = await runOversizeClient(dev.origin, mode, 20, "/body", "/a1");
        expect(tally, `${mode} oversize`).toEqual({
          ok: 60,
          failures: {},
          followUpFailures: {},
          slowestMs: tally.slowestMs,
        });
        expect(tally.slowestMs).toBeLessThan(5_000);
      }
    },
    { timeout: 300_000 },
  );
}

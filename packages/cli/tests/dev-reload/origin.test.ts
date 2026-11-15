/**
 * RK-39: a real `relkit dev`, run by Node and by Bun, judges a state-changing request's `Origin`
 * against the origin the client used (the development front), not the worker's private port, and
 * forwarding headers sent by the client do not change that verdict.
 */
import { afterAll, expect, test } from "bun:test";
import { createDevFixture, startDev } from "./dev-reload.fixture.js";
import type { DevProcess } from "./dev-reload.fixture.types.js";

const fixture = createDevFixture();
fixture.write(
  "src/routes/submit/route.ts",
  'import { defineRoute } from "relkit";\nimport alpha from "../../services/alpha/service.js";\n\nexport const POST = defineRoute({ target: alpha.a1 });\n',
);
let running: DevProcess | undefined;

afterAll(async () => {
  await running?.stop();
  fixture.remove();
}, 60_000);

const CROSS_ORIGIN = "http://attacker.example";
const SPOOFED = {
  "x-forwarded-host": "attacker.example",
  "x-forwarded-proto": "http",
  forwarded: "host=attacker.example;proto=http",
};

/**
 * Sends a JSON `POST /submit`.
 * @param dev - Running development server.
 * @param headers - Extra request headers.
 * @returns Status and decoded body.
 */
async function submit(dev: DevProcess, headers: Record<string, string>) {
  const response = await dev.request("/submit", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: "{}",
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

for (const host of ["node", "bun"] as const) {
  test(
    `relkit dev on ${host} admits same-origin POSTs and denies cross-origin ones`,
    async () => {
      await running?.stop();
      running = await startDev(fixture.root, true, [], host);
      const dev = running;
      await dev.waitFor("/a1", "a1 v0");

      const same = await submit(dev, { origin: dev.origin });
      expect(same, dev.output().slice(-3_000)).toMatchObject({
        status: 200,
        body: { message: "a1 v0" },
      });
      expect(await submit(dev, { origin: CROSS_ORIGIN })).toMatchObject({
        status: 403,
        body: { code: "origin-denied" },
      });
      // Development admits an Origin-less request as a trusted service call, on both runtimes.
      expect(await submit(dev, {})).toMatchObject({ status: 200, body: { message: "a1 v0" } });
      // Client-sent forwarding headers neither admit a foreign origin nor deny the real one.
      expect(await submit(dev, { origin: CROSS_ORIGIN, ...SPOOFED })).toMatchObject({
        status: 403,
        body: { code: "origin-denied" },
      });
      expect(await submit(dev, { origin: dev.origin, ...SPOOFED })).toMatchObject({
        status: 200,
      });
      // Reads are not origin-checked.
      const read = await dev.request("/a1", { headers: { origin: CROSS_ORIGIN } });
      expect(read.status).toBe(200);
      await read.body?.cancel();
    },
    { timeout: 300_000 },
  );
}

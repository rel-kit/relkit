/** Verifies native backend responsiveness, stable activation and scoped fixture/session release. */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { expect, test } from "bun:test";

import { startDev, type DevOptions } from "./src/commands/dev.js";

import { checkDevProject } from "./src/commands/dev-check.js";

import { makeRoot, options, adoptSession } from "../../tests/fixtures/cli/dev-fixture.js";
import { registerDevCleanup } from "../../tests/fixtures/cli/dev-fixture.js";

registerDevCleanup();

test("serves the active generation throughout a CPU-heavy failed check and recovers", async () => {
  const root = await makeRoot();
  await writeFile(
    join(root, "relkit.config.ts"),
    // Models synchronous configuration and TypeScript work without a machine-dependent project size.
    'const deadline = performance.now() + 1_500; while (performance.now() < deadline) {}\nthrow new Error("invalid changed config");',
  );
  let builds = 0;
  const session = await startDev({
    ...options(root, "sha256:responsive"),
    compile: async (request) => {
      if (++builds === 2) {
        const checked = await checkDevProject(
          { projectRoot: root, generationId: "heavy-reload" },
          request.signal,
        );
        expect(checked.ok).toBe(false);
        throw new Error("invalid changed config");
      }
      return options(root, "sha256:responsive").compile(request);
    },
  });
  await adoptSession(session);
  const active = session.active;
  let rebuilding = true;
  const cycleDurations: number[] = [];
  const requests = (async () => {
    while (rebuilding) {
      const started = performance.now();
      expect(await (await fetch(`http://127.0.0.1:${session.backendPort}/hello`)).text()).toBe(
        "hello",
      );
      await Bun.sleep(25);
      cycleDurations.push(performance.now() - started);
    }
  })();
  try {
    expect(await session.notifySourceChange(1, ["relkit.config.ts"])).toBe(false);
  } finally {
    rebuilding = false;
    await requests;
  }
  expect(session.active).toBe(active);
  expect(Math.max(...cycleDurations)).toBeLessThan(1_000);
  expect(cycleDurations.length).toBeGreaterThan(1);
  expect(await session.notifySourceChange(2, ["relkit.config.ts"])).toBe(true);
  expect(session.active).not.toBe(active);
}, 15_000);

test("owns a stable proxy, dynamic backend, candidate, and clean stop", async () => {
  const root = await makeRoot();
  const graphHash = "sha256:dev-test";
  const logs: Parameters<NonNullable<DevOptions["onLog"]>>[0][] = [];
  let localCloses = 0;
  const session = await startDev({
    ...options(root, graphHash),
    onLog: (event) => logs.push(event),
    localServices: { close: async () => void (localCloses += 1) },
  });
  await adoptSession(session);

  expect(session.backendPort).toBeGreaterThan(0);
  expect(session.activeTarget?.port).toBeGreaterThan(0);
  expect(session.activeTarget?.port).not.toBe(session.backendPort);
  expect(session.stateMachine.state).toBe("active");
  expect(logs).toContainEqual({
    level: "info",
    event: "dev.ready",
    fields: expect.objectContaining({
      openapi: `http://127.0.0.1:${session.backendPort}/_relkit/v1/openapi.json`,
      apiReference: `http://127.0.0.1:${session.backendPort}/_relkit/v1/api-reference`,
    }),
  });
  expect(await (await fetch(`http://127.0.0.1:${session.backendPort}/hello`)).text()).toBe("hello");

  const candidate = session.active;
  await session.stop();
  await candidate?.process.exited;
  expect(localCloses).toBe(1);
  await expect(fetch(`http://127.0.0.1:${session.backendPort}/hello`)).rejects.toThrow();
});

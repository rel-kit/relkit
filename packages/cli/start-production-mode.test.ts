/** Verifies that `relkit start` runs a built server in production mode unless the operator chooses otherwise. */
import { afterEach, beforeEach, expect, test } from "bun:test";
import { buildProject } from "./src/commands/build.js";
import { startProject } from "./src/commands/start.js";
import {
  copyProject,
  registerCommandCleanup,
} from "../../tests/fixtures/cli/commands-core-fixture.js";

registerCommandCleanup();

const saved = { NODE_ENV: process.env.NODE_ENV, RELKIT_ENV: process.env.RELKIT_ENV };
beforeEach(() => {
  delete process.env.NODE_ENV;
  delete process.env.RELKIT_ENV;
});
afterEach(() => {
  for (const [name, value] of Object.entries(saved))
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
});

for (const runtime of ["bun", "node"] as const) {
  test(`start without NODE_ENV or RELKIT_ENV serves the ${runtime} build in production mode`, async () => {
    const root = await copyProject("tests/compiler/fixtures/valid-minimal");
    await buildProject({ projectRoot: root, runtime });
    const started = await startProject({ projectRoot: root, port: 0, healthTimeoutMs: 5_000 });
    try {
      const base = `http://${started.hostname}:${started.port}/_relkit/v1`;
      expect((await fetch(`${base}/health/live`)).status).toBe(200);
      for (const path of ["graph", "openapi.json", "api-reference"])
        expect((await fetch(`${base}/${path}`)).status).toBe(404);
    } finally {
      await started.stop();
    }
  });
}

test("start keeps an operator-selected RELKIT_ENV", async () => {
  const root = await copyProject("tests/compiler/fixtures/valid-minimal");
  await buildProject({ projectRoot: root });
  const started = await startProject({
    projectRoot: root,
    port: 0,
    healthTimeoutMs: 5_000,
    environment: { RELKIT_ENV: "development" },
  });
  try {
    const graph = await fetch(`http://${started.hostname}:${started.port}/_relkit/v1/graph`);
    expect(graph.status).toBe(200);
  } finally {
    await started.stop();
  }
});

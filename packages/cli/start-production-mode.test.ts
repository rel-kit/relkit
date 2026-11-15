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
      for (const path of ["graph", "openapi.json", "api-reference"])
        expect((await fetch(`${base}/${path}`)).status).toBe(404);
      // Production health answers status and readiness only, never the generation identity.
      for (const [path, status] of [
        ["health/live", "ok"],
        ["health/ready", "ready"],
      ] as const) {
        const response = await fetch(`${base}/${path}`);
        expect(response.status).toBe(200);
        const body = (await response.json()) as Record<string, unknown>;
        expect(body).toMatchObject({ status });
        for (const field of [
          "graphHash",
          "activationFingerprint",
          "manifestGraphHash",
          "graphContractVersion",
          "manifestContractVersion",
          "manifestGeneratorVersion",
          "sourceToken",
          "generationToken",
        ])
          expect(body).not.toHaveProperty(field);
      }
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
    const base = `http://${started.hostname}:${started.port}/_relkit/v1`;
    expect((await fetch(`${base}/graph`)).status).toBe(200);
    // The development supervisor reads the generation identity from the health probes.
    for (const path of ["health/live", "health/ready"])
      expect(await (await fetch(`${base}/${path}`)).json()).toMatchObject({
        graphHash: expect.any(String),
        activationFingerprint: expect.any(Object),
        manifestGraphHash: expect.any(String),
        environmentReady: true,
        providerReady: true,
      });
  } finally {
    await started.stop();
  }
});

/** Verifies native production start through public HTTP, observer pagination and joined external-abort shutdown. */
import { expect, test } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";

import { join } from "node:path";

import { buildProject } from "./src/commands/build.js";

import { startProject } from "./src/commands/start.js";

import { Effect } from "effect";
import { copyProject } from "../../tests/fixtures/cli/commands-core-fixture.js";
import { assertStartedHttp } from "../../tests/fixtures/cli/commands-core-http.js";
import { registerCommandCleanup } from "../../tests/fixtures/cli/commands-core-fixture.js";

registerCommandCleanup();

test("start serves health, graph, inspector collections, and rejects an invalid build", async () => {
  const root = await copyProject("tests/compiler/fixtures/valid-minimal");
  const built = await buildProject({ projectRoot: root });
  const manifestPath = join(built.buildDirectory, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  expect(manifest.entrypoint).toBe("server/index.js");
  const started = await startProject({ projectRoot: root, port: 0, healthTimeoutMs: 3_000 });
  try {
    await Effect.runPromise(assertStartedHttp(started, built));
  } finally {
    await started.stop();
  }
  expect(await started.exited).toBe(0);

  await expect(
    startProject({ projectRoot: root, buildDirectory: join(root, ".relkit", "missing") }),
  ).rejects.toThrow();
  for (const entrypoint of ["server/index.ts", "../server/index.js", "/server/index.js"]) {
    await writeFile(manifestPath, JSON.stringify({ ...manifest, entrypoint }));
    await expect(startProject({ projectRoot: root, port: 0 })).rejects.toThrow(
      "Built manifest paths are invalid.",
    );
  }
});

test("start cleanup follows an external abort signal", async () => {
  const root = await copyProject("tests/compiler/fixtures/valid-minimal");
  await buildProject({ projectRoot: root });
  const controller = new AbortController();
  const started = await startProject({
    projectRoot: root,
    port: 0,
    signal: controller.signal,
    healthTimeoutMs: 3_000,
  });
  controller.abort();
  await started.exited;
  expect(started.process.exitCode).toBe(0);
});

test("production start keeps internal endpoints private", async () => {
  const root = await copyProject("tests/compiler/fixtures/valid-minimal");
  await buildProject({ projectRoot: root });
  const started = await startProject({
    projectRoot: root,
    port: 0,
    environment: { NODE_ENV: "production" },
  });
  try {
    const live = await fetch(`http://${started.hostname}:${started.port}/_relkit/v1/health/live`);
    const graph = await fetch(`http://${started.hostname}:${started.port}/_relkit/v1/graph`);
    expect(live.status).toBe(200);
    expect(graph.status).toBe(404);
    expect(await graph.text()).not.toContain("Runtime graph hash verification failed");
  } finally {
    await started.stop();
  }
});

/** Checks reproducible production artifacts, provider readiness and bounded drain/flush through the real CLI runtime. */
import { afterEach, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildProject } from "../../packages/cli/src/commands/build.ts";
import { startProject } from "../../packages/cli/src/commands/start.ts";
import {
  ARTIFACTS,
  roots,
  copyProject,
  readArtifacts,
  filesIn,
  waitForFile,
  within,
  handlerSource,
} from "./lifecycle.fixture.ts";
const API = "/_relkit/v1";
const successful = new Set<string>();
afterEach(async () => {
  for (const root of roots.splice(0)) {
    if (successful.delete(root)) await rm(root, { recursive: true, force: true });
    else console.error(`Failed container lifecycle fixture retained: ${root}`);
  }
});

test("builds reproducible production context without local env or state", async () => {
  const firstRoot = await copyProject();
  const secondRoot = await copyProject();
  for (const root of [firstRoot, secondRoot]) {
    await writeFile(join(root, ".env"), "RELKIT_SYNTHETIC_SECRET=container-secret");
    await mkdir(join(root, ".relkit", "state"), { recursive: true });
    await writeFile(join(root, ".relkit", "state", "local.json"), "local-state");
    await mkdir(join(root, ".relkit", "observability"), { recursive: true });
    await writeFile(join(root, ".relkit", "observability", "request.ndjson"), "local-record");
  }

  const first = await buildProject({ projectRoot: firstRoot });
  const second = await buildProject({ projectRoot: secondRoot });
  expect(first.ok).toBe(true);
  expect(second.ok).toBe(true);
  const firstBytes = await readArtifacts(first.buildDirectory);
  const secondBytes = await readArtifacts(second.buildDirectory);
  expect(secondBytes).toEqual(firstBytes);
  expect(await filesIn(first.buildDirectory)).toEqual([...ARTIFACTS].sort());

  const dockerfile = firstBytes.get("Dockerfile") ?? "";
  const dockerignore = firstBytes.get(".dockerignore") ?? "";
  expect(dockerfile).toContain("FROM oven/bun:1.3.10");
  expect(dockerfile).toContain(
    "RUN mkdir -p .relkit/state .relkit/observability && chown -R bun:bun .relkit",
  );
  expect(dockerfile).toContain("USER bun");
  expect(dockerfile).toContain("STOPSIGNAL SIGTERM");
  expect(dockerfile).not.toContain("COPY .");
  expect(dockerignore).toContain(".env");
  expect(dockerignore).toContain(".relkit/state");
  expect(dockerignore).toContain(".relkit/observability");
  expect([...firstBytes.values()].join("\n")).not.toContain("container-secret");
  for (const root of [firstRoot, secondRoot]) successful.add(root);
});

test("keeps liveness available while provider readiness is pending", async () => {
  const root = await copyProject();
  await buildProject({ projectRoot: root });
  const probes: Array<{ path: string; status: number; body: Record<string, unknown> }> = [];
  const probe: typeof fetch = async (input, init) => {
    const response = await fetch(input, init);
    const body = (await response.clone().json()) as Record<string, unknown>;
    probes.push({ path: new URL(input.toString()).pathname, status: response.status, body });
    return response;
  };

  const started = await startProject({
    projectRoot: root,
    port: 0,
    healthTimeoutMs: 3_000,
    environment: { RELKIT_PROVIDER_READY_DELAY_MS: "1000" },
    fetch: probe,
  });
  try {
    expect(probes[0]).toMatchObject({ path: `${API}/health/live`, status: 200 });
    expect(probes[1]).toMatchObject({
      path: `${API}/health/ready`,
      status: 503,
      body: { environmentReady: true, providerReady: false },
    });
    expect(
      probes.some(
        ({ path, status, body }) =>
          path === `${API}/health/ready` &&
          status === 200 &&
          body.status === "ready" &&
          body.providerReady === true,
      ),
    ).toBe(true);
  } finally {
    await started.stop();
  }
  successful.add(root);
});

test("stops admission, cancels in-flight work, flushes telemetry, and exits on time", async () => {
  const root = await copyProject();
  const startedFile = join(root, "in-flight.started");
  const cancelledFile = join(root, "in-flight.cancelled");
  const flushedFile = join(root, "telemetry.flushed");
  const rejectedFile = join(root, "admission.rejected");
  const rejectionUrlFile = join(root, "admission.url");
  await writeFile(join(root, "src", "hello", "functions", "hello.function.ts"), handlerSource());
  await buildProject({ projectRoot: root });
  const started = await startProject({
    projectRoot: root,
    port: 0,
    healthTimeoutMs: 3_000,
    environment: {
      RELKIT_TEST_INFLIGHT_FILE: startedFile,
      RELKIT_TEST_CANCEL_FILE: cancelledFile,
      RELKIT_TEST_FLUSH_FILE: flushedFile,
      RELKIT_TEST_ADMISSION_FILE: rejectedFile,
      RELKIT_TEST_ADMISSION_URL_FILE: rejectionUrlFile,
      RELKIT_DRAIN_TIMEOUT_MS: "50",
      RELKIT_TELEMETRY_FLUSH_TIMEOUT_MS: "100",
    },
  });

  try {
    const url = `http://${started.hostname}:${started.port}/hello/drain`;
    const inFlight = fetch(url)
      .then(async (response) => ({ status: response.status, body: await response.text() }))
      .catch(() => ({ status: undefined, body: "" }));
    await waitForFile(startedFile);
    await writeFile(rejectionUrlFile, `http://${started.hostname}:${started.port}/hello/new`);

    const shutdownAt = Date.now();
    started.process.kill("SIGTERM");
    const result = await inFlight;
    const exitCode = await within(started.exited, 1_000);

    expect(await Bun.file(rejectedFile).text()).toBe('503:{"error":"draining"}');
    expect([200, 499, undefined]).toContain(result.status);
    await waitForFile(cancelledFile);
    await waitForFile(flushedFile);
    expect(exitCode).toBe(0);
    expect(Date.now() - shutdownAt).toBeLessThan(1_000);
  } finally {
    if (started.process.exitCode === null) await started.stop();
  }
  successful.add(root);
});

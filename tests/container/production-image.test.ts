/**
 * Proves the production image properties for Bun and Node: it runs as a non-root user, answers
 * `/healthz` (503 while providers start, 200 once ready) and reports healthy through its Docker
 * HEALTHCHECK, starts on a read-only root filesystem, and refuses to keep jobs on its own disk.
 */
import { afterEach, expect, test } from "bun:test";
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildProject } from "../../packages/cli/src/commands/build.ts";
import { copyProject, roots } from "./lifecycle.fixture.ts";
import { containerLogs, docker, dockerOutput, freePort, waitForStatus } from "./docker.fixture.ts";

const successful = new Set<string>();
const images: string[] = [];
const containers: string[] = [];

afterEach(async () => {
  for (const name of containers.splice(0)) await docker(["rm", "--force", name]);
  for (const image of images.splice(0)) await docker(["image", "rm", "--force", image]);
  for (const root of roots.splice(0)) {
    if (successful.delete(root)) await rm(root, { recursive: true, force: true });
    else console.error(`Failed production image fixture retained: ${root}`);
  }
});

for (const runtime of ["bun", "node"] as const) {
  test(`${runtime} image runs non-root on a read-only root and answers /healthz`, async () => {
    const root = await copyProject();
    const image = await buildImage(root, runtime);
    const dockerfile = await Bun.file(join(root, ".relkit/build/Dockerfile")).text();
    expect(dockerfile).toContain(`USER ${runtime}`);
    expect(dockerfile).toContain("ENV RELKIT_DURABLE_STATE=external");
    expect(dockerfile).toContain("HEALTHCHECK");
    expect(await dockerOutput(["image", "inspect", "--format", "{{.Config.User}}", image])).toBe(
      runtime,
    );

    const port = freePort();
    const name = container(image);
    // A slow provider shows /healthz failing until readiness, while liveness already answers.
    expect(
      await docker([
        "run",
        "--detach",
        "--read-only",
        "--tmpfs",
        "/tmp",
        "--name",
        name,
        "--env",
        "RELKIT_PROVIDER_READY_DELAY_MS=4000",
        "-p",
        `127.0.0.1:${port}:3000`,
        image,
      ]),
    ).toBe(0);
    const base = `http://127.0.0.1:${port}`;
    expect(await waitForStatus(`${base}/_relkit/v1/health/live`, 200)).toBe(true);
    const pending = await fetch(`${base}/healthz`);
    expect(pending.status).toBe(503);
    expect(await pending.json()).toEqual({ status: "not-ready", live: true, ready: false });
    expect(await waitForStatus(`${base}/healthz`, 200)).toBe(true);
    expect(await (await fetch(`${base}/healthz`)).json()).toEqual({
      status: "ready",
      live: true,
      ready: true,
    });
    expect(await dockerOutput(["exec", name, "id", "-u"])).not.toBe("0");
    expect(await waitForHealthy(name)).toBe(true);
    successful.add(root);
  }, 600_000);
}

test("the image refuses local durable jobs unless a mounted volume opts in", async () => {
  const root = await copyLocalJobsProject();
  const image = await buildImage(root, "bun");
  const port = freePort();
  const refused = container(image);
  expect(
    await docker(["run", "--detach", "--name", refused, "-p", `127.0.0.1:${port}:3000`, image]),
  ).toBe(0);
  const base = `http://127.0.0.1:${port}`;
  expect(await waitForStatus(`${base}/_relkit/v1/health/live`, 200)).toBe(true);
  await Bun.sleep(1_000);
  expect((await fetch(`${base}/healthz`)).status).toBe(503);
  expect(await containerLogs(refused)).toContain("RELKIT_LOCAL_DURABLE_STATE_IN_CONTAINER");
  await docker(["rm", "--force", refused]);

  const allowed = container(image);
  const volume = `${allowed}-state`;
  expect(
    await docker([
      "run",
      "--detach",
      "--name",
      allowed,
      "--env",
      "RELKIT_ALLOW_LOCAL_DURABLE_STATE=1",
      "--volume",
      `${volume}:/app/.relkit/state`,
      "-p",
      `127.0.0.1:${port}:3000`,
      image,
    ]),
  ).toBe(0);
  try {
    expect(await waitForStatus(`${base}/healthz`, 200)).toBe(true);
  } finally {
    await docker(["rm", "--force", allowed]);
    await docker(["volume", "rm", "--force", volume]);
  }
  successful.add(root);
}, 600_000);

/**
 * Builds the production output and its image.
 * @param root - Fixture project.
 * @param runtime - Server runtime.
 * @returns The image tag, removed after the test.
 */
async function buildImage(root: string, runtime: "bun" | "node"): Promise<string> {
  const result = await buildProject({ projectRoot: root, runtime });
  expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true);
  const image = `relkit-production-image-test:${runtime}-${process.pid}-${Date.now()}`;
  images.push(image);
  expect(await docker(["build", "--quiet", "--tag", image, result.buildDirectory])).toBe(0);
  return image;
}

/**
 * Names a container owned by this test file.
 * @param image - Image tag.
 * @returns A unique container name, removed after the test.
 */
function container(image: string): string {
  const name = `${image.replace(/[:]/g, "-")}-${containers.length}`;
  containers.push(name);
  return name;
}

/**
 * Copies the production fixture that selects the local jobs provider.
 * @returns A project root linked to the workspace packages, including `@relkit/local`.
 */
async function copyLocalJobsProject(): Promise<string> {
  const root = await mkdtemp(join("/tmp", "relkit-container-local-jobs-"));
  roots.push(root);
  await cp(join(process.cwd(), "packages/cli/tests/server-runtime/production-app"), root, {
    recursive: true,
  });
  await cp(join(process.cwd(), "examples/commerce/package.json"), join(root, "package.json"));
  await writeFile(
    join(root, "relkit.config.ts"),
    `import { defineApp, defineEnv } from "relkit/config";
import { localJob } from "@relkit/local";

export default defineApp({
  id: "production-closure",
  env: defineEnv({}),
  jobs: { default: localJob() },
  defaults: { jobs: "default" },
});
`,
  );
  const scope = join(root, "node_modules", "@relkit");
  await mkdir(scope, { recursive: true });
  await symlink(join(process.cwd(), "packages/relkit"), join(root, "node_modules/relkit"));
  for (const name of ["app", "cli", "testing"])
    await symlink(join(process.cwd(), "packages", name), join(scope, name));
  await symlink(join(process.cwd(), "integrations/packages/local"), join(scope, "local"));
  return root;
}

/**
 * Waits for Docker to report the container healthy through the image HEALTHCHECK.
 * @param name - Container name.
 * @returns Whether it turned healthy within 90 seconds.
 */
async function waitForHealthy(name: string): Promise<boolean> {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const status = await dockerOutput(["inspect", "--format", "{{.State.Health.Status}}", name]);
    if (status === "healthy") return true;
    await Bun.sleep(1_000);
  }
  return false;
}

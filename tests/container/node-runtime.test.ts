/** Builds the production server for Node, then builds and runs its container image. */
import { afterEach, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { buildProject } from "../../packages/cli/src/commands/build.ts";
import { copyProject, roots } from "./lifecycle.fixture.ts";

const successful = new Set<string>();
const images: string[] = [];

afterEach(async () => {
  for (const image of images.splice(0)) await docker(["image", "rm", "--force", image]);
  for (const root of roots.splice(0)) {
    if (successful.delete(root)) await rm(root, { recursive: true, force: true });
    else console.error(`Failed Node container fixture retained: ${root}`);
  }
});

test("relkit build --runtime node emits a Node image that serves the application", async () => {
  const root = await copyProject();
  const result = await buildProject({ projectRoot: root, runtime: "node" });
  expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true);
  const dockerfile = await Bun.file(`${result.buildDirectory}/Dockerfile`).text();
  expect(dockerfile).toContain("FROM node:24.22.0-bookworm-slim@sha256:");
  expect(dockerfile).toContain("COPY --from=dependencies /app/node_modules ./node_modules");
  expect(dockerfile).toContain('CMD ["node", "server/index.js"]');
  expect(dockerfile).toContain("USER node");
  expect(await Bun.file(`${result.buildDirectory}/manifest.json`).json()).toMatchObject({
    runtime: "node",
  });
  const server = await Bun.file(`${result.buildDirectory}/server/index.js`).text();
  expect(server).not.toContain("// @bun");

  const image = `relkit-node-runtime-test:${process.pid}-${Date.now()}`;
  images.push(image);
  expect(await docker(["build", "--quiet", "--tag", image, result.buildDirectory])).toBe(0);
  const name = image.replace(/[:]/g, "-");
  const port = 30_000 + Math.floor(Math.random() * 20_000);
  expect(
    await docker([
      "run",
      "--detach",
      "--rm",
      "--name",
      name,
      "-p",
      `127.0.0.1:${port}:3000`,
      image,
    ]),
  ).toBe(0);
  try {
    const ready = await waitForReady(`http://127.0.0.1:${port}/_relkit/v1/health/ready`);
    expect(ready).toBe(true);
    const version = Bun.spawn(["docker", "exec", name, "node", "--version"], { stdout: "pipe" });
    expect((await new Response(version.stdout).text()).trim()).toBe("v24.22.0");
  } finally {
    await docker(["stop", "--timeout", "10", name]);
  }
  successful.add(root);
}, 600_000);

/**
 * Runs one Docker command.
 * @param args - Docker arguments.
 * @returns Exit code.
 */
async function docker(args: readonly string[]): Promise<number> {
  const child = Bun.spawn(["docker", ...args], { stdout: "inherit", stderr: "inherit" });
  return child.exited;
}

/**
 * Polls the readiness endpoint.
 * @param url - Readiness URL.
 * @returns Whether it answered 200 within a minute.
 */
async function waitForReady(url: string): Promise<boolean> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const status = await fetch(url).then(
      (response) => response.status,
      () => 0,
    );
    if (status === 200) return true;
    await Bun.sleep(500);
  }
  return false;
}

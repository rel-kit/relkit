/** Starts the native browser fixture to prove its project writes stay under runner-owned repository paths. */
import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, rm, symlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const repository = resolve(import.meta.dir, "../..");
const fixtureServer = resolve(import.meta.dir, "fixture-server.ts");

test("an external fixture project is rejected before writing its directory", async () => {
  const outside = await mkdtemp(resolve(tmpdir(), "relkit-foreign-fixture-"));
  try {
    const project = resolve(outside, "project");
    const result = Bun.spawnSync([process.execPath, fixtureServer], {
      cwd: repository,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 1500,
      env: { ...process.env, RELKIT_FIXTURE_PROJECT: project, RELKIT_FIXTURE_PORT: "0" },
    });
    expect(existsSync(project)).toBe(false);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).toContain("Invalid browser fixture project");
  } finally {
    await rm(outside, { recursive: true, force: true });
  }
});

test("an owned-looking fixture parent symlink cannot redirect writes outside the repository", async () => {
  const outside = await mkdtemp(resolve(tmpdir(), "relkit-foreign-fixture-"));
  await mkdir(resolve(repository, ".relkit"), { recursive: true });
  const owned = await mkdtemp(resolve(repository, ".relkit/inspector-browser-paths-"));
  const link = `${owned}-link`;
  try {
    await symlink(outside, link);
    const result = Bun.spawnSync([process.execPath, fixtureServer], {
      cwd: repository,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 1500,
      env: {
        ...process.env,
        RELKIT_FIXTURE_PROJECT: resolve(link, "project"),
        RELKIT_FIXTURE_PORT: "0",
      },
    });
    expect(existsSync(resolve(outside, "project"))).toBe(false);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).toContain("Invalid browser fixture project");
  } finally {
    await rm(link, { force: true });
    await rm(owned, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("an owned project leaf symlink is rejected before bridge discovery writes", async () => {
  const outside = await mkdtemp(resolve(tmpdir(), "relkit-foreign-fixture-"));
  await mkdir(resolve(repository, ".relkit"), { recursive: true });
  const owned = await mkdtemp(resolve(repository, ".relkit/inspector-browser-paths-"));
  try {
    const project = resolve(owned, "project");
    await symlink(outside, project);
    const result = Bun.spawnSync([process.execPath, fixtureServer], {
      cwd: repository,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 1500,
      env: { ...process.env, RELKIT_FIXTURE_PROJECT: project, RELKIT_FIXTURE_PORT: "0" },
    });
    expect(existsSync(resolve(outside, ".relkit"))).toBe(false);
    expect(result.stderr.toString()).toContain("Invalid browser fixture project directory");
  } finally {
    await rm(owned, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

for (const prefix of ["playwright-inspector-", "inspector-browser-"])
  test(`${prefix} project starts the native fixture and releases its bridge descriptor`, async () => {
    await mkdir(resolve(repository, ".relkit"), { recursive: true });
    const owned = await mkdtemp(resolve(repository, `.relkit/${prefix}`));
    const project = resolve(owned, "project");
    const child = Bun.spawn([process.execPath, fixtureServer], {
      cwd: repository,
      stdout: "pipe",
      stderr: "pipe",
      signal: AbortSignal.timeout(5000),
      env: { ...process.env, RELKIT_FIXTURE_PROJECT: project, RELKIT_FIXTURE_PORT: "0" },
    });
    const stderr = new Response(child.stderr).text();
    try {
      const url = await fixtureReady(child.stdout);
      const response = await fetch(`${url}/_relkit/v1/health/ready`);
      expect(response.ok).toBe(true);
      await response.body?.cancel();
      expect(existsSync(project)).toBe(true);
    } finally {
      child.kill("SIGTERM");
      await child.exited;
      await stderr;
      expect(await readdir(resolve(project, ".relkit/connections"))).toEqual([]);
      await rm(owned, { recursive: true, force: true });
    }
  });

/**
 * Reads the fixture's actual readiness line before a native HTTP assertion.
 * @param stdout - Borrowed child output, bounded by the child's abort deadline.
 * @returns Its allocated backend URL once bridge startup has completed.
 */
async function fixtureReady(stdout: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stdout.getReader();
  const decoder = new TextDecoder();
  let text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) throw new Error(`Fixture exited before readiness: ${text}`);
      text += decoder.decode(chunk.value, { stream: true });
      const match = /Inspector fixture backend listening on (http:\/\/127\.0\.0\.1:\d+)/.exec(text);
      if (match?.[1]) return match[1];
    }
  } finally {
    reader.releaseLock();
  }
}

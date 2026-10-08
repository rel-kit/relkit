import { strict as assert } from "node:assert";
import { cp, lstat, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildProject } from "../../src/commands/build.js";
import { linkWorkspacePackages } from "../../test-workspace.js";

/** Executes the emitted production bundle in a directory with no workspace links.
 * @returns After real health admission and graceful signal shutdown.
 * @remarks This is a Bun acceptance boundary; run directly rather than under Vitest.
 */
async function verifyStandaloneRuntime(): Promise<void> {
  const repository = resolve(import.meta.dir, "../../../..");
  const project = await mkdtemp(join(tmpdir(), "relkit-runtime-build-"));
  const standalone = await mkdtemp(join(tmpdir(), "relkit-runtime-standalone-"));
  let child: Bun.Subprocess<"ignore", "pipe", "pipe"> | undefined;
  let output: Promise<string[]> | undefined;
  try {
    await cp(join(repository, "tests/compiler/fixtures/valid-minimal"), project, {
      recursive: true,
    });
    await cp(join(repository, "examples/commerce/package.json"), join(project, "package.json"));
    await linkWorkspacePackages(project);
    const built = await buildProject({ projectRoot: project });
    assert.equal(built.ok, true, JSON.stringify(built.diagnostics));
    await cp(join(project, ".relkit/build"), standalone, { recursive: true });
    await assert.rejects(lstat(join(standalone, "node_modules")), { code: "ENOENT" });
    const bundle = await readFile(join(standalone, "server/index.js"), "utf8");
    assert.ok(!/from\s+["']@relkit\/cli\/internal\/server-runtime["']/.test(bundle));
    assert.ok(!/import\(["']@relkit\/cli\/internal\/server-runtime["']\)/.test(bundle));
    const probe = Bun.serve({ port: 0, fetch: () => new Response() });
    const port = probe.port;
    await probe.stop(true);
    child = Bun.spawn([process.execPath, "run", "--no-env-file", "server/index.js"], {
      cwd: standalone,
      env: { ...process.env, NODE_ENV: "production", RELKIT_ENV: "production", PORT: String(port) },
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
    output = Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
    let ready = false;
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline && child.exitCode === null) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/_relkit/v1/health/ready`, {
          signal: AbortSignal.timeout(500),
        });
        ready = response.ok;
        if (ready) break;
      } catch {
        // The physically owned child has not bound its listener yet.
      }
      await Bun.sleep(25);
    }
    assert.equal(
      ready,
      true,
      child.exitCode === null ? "Standalone readiness timed out" : (await output).join("\n"),
    );
    child.kill("SIGTERM");
    try {
      assert.equal(await physicalExit(child, 5_000), 0, (await output).join("\n"));
    } catch (failure) {
      if (child.exitCode === null) child.kill("SIGKILL");
      await physicalExit(child, 2_000);
      throw failure;
    }
    console.log(
      "Standalone Effect runtime: production bundle, health and graceful shutdown passed.",
    );
  } finally {
    if (child?.exitCode === null) {
      child.kill("SIGKILL");
      await physicalExit(child, 2_000);
    }
    await output;
    await rm(project, { recursive: true, force: true });
    await rm(standalone, { recursive: true, force: true });
  }
}

/** Waits for the physically owned child with an explicit acceptance deadline.
 * @param child - Owned native server process.
 * @param timeoutMs - Maximum exit wait.
 * @returns Physical exit status; timeout is a clear acceptance failure.
 */
async function physicalExit(child: Bun.Subprocess, timeoutMs: number): Promise<number> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      child.exited,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Standalone shutdown did not exit within ${timeoutMs}ms.`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

await verifyStandaloneRuntime();

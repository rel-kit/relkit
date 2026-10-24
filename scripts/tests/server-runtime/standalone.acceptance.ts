/** Executes a relocated production artifact without installed development tooling. */
import { strict as assert } from "node:assert";
import { cp, lstat, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildWorkspaceProduction } from "./workspace-production.js";
import { verifyStandaloneServer } from "./standalone-process.js";

/**
 * Runs the workspace build proof separately from packed-install acceptance.
 * @returns After relocated JavaScript startup, health and graceful shutdown pass and owned fixtures are cleaned.
 */
async function verifyStandaloneRuntime(): Promise<void> {
  const repository = resolve(import.meta.dir, "../../..");
  const project = await mkdtemp(join(tmpdir(), "relkit-runtime-build-"));
  const standalone = await mkdtemp(join(tmpdir(), "relkit-runtime-standalone-"));
  let passed = false;
  try {
    await cp(join(repository, "tests/compiler/fixtures/valid-minimal"), project, {
      recursive: true,
    });
    await cp(join(repository, "examples/commerce/package.json"), join(project, "package.json"));
    await buildWorkspaceProduction(repository, project);
    await cp(join(project, ".relkit/build"), join(standalone, ".relkit/build"), {
      recursive: true,
    });
    await assert.rejects(lstat(join(standalone, "node_modules")), { code: "ENOENT" });
    const bundle = await readFile(join(standalone, ".relkit/build/server/index.js"), "utf8");
    assert.ok(!/from\s+["']@relkit\/cli\/internal\/server-runtime["']/.test(bundle));
    assert.ok(!/import\(["']@relkit\/cli\/internal\/server-runtime["']\)/.test(bundle));
    await verifyStandaloneServer(standalone);
    console.log(
      "Standalone Effect runtime: relocated JavaScript, health and graceful shutdown passed.",
    );
    passed = true;
  } finally {
    if (passed) {
      await rm(project, { recursive: true, force: true });
      await rm(standalone, { recursive: true, force: true });
    } else console.error(`Failed production fixtures retained at ${project} and ${standalone}`);
  }
}

await verifyStandaloneRuntime();

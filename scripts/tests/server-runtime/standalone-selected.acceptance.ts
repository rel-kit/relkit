/** Verifies selected native production behavior against current workspace producers. */
import { strict as assert } from "node:assert";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildWorkspaceProduction } from "./workspace-production.js";
import { selectedWorkerAssets } from "./standalone-assets.js";
import { verifyProductionNativeWorker } from "./production-native-proof.js";
import { verifyStandaloneServer } from "./standalone-process.js";

/**
 * Runs workspace native behavior separately from candidate-only installation acceptance.
 * @returns After the workspace native worker, Scalar, health and graceful shutdown assertions pass.
 */
async function verifySelectedRuntime(): Promise<void> {
  const repository = resolve(import.meta.dirname, "../../..");
  const project = await mkdtemp(join(tmpdir(), "relkit-selected-production-source-"));
  let passed = false;
  try {
    await cp(join(repository, "packages/cli/tests/server-runtime/production-app"), project, {
      recursive: true,
    });
    await cp(join(repository, "examples/commerce/package.json"), join(project, "package.json"));
    await buildWorkspaceProduction(repository, project);
    const manifest = await readFile(join(project, ".relkit/build/package.json"), "utf8");
    assert.match(manifest, /@scalar\/hono-api-reference/);
    assert.ok(await selectedWorkerAssets(project));
    await verifyStandaloneServer(project, (url) => verifyProductionNativeWorker(project, url));
    console.log(
      "Workspace production: selected Scalar and native durable task output, health and SIGTERM passed.",
    );
    passed = true;
  } finally {
    if (passed) await rm(project, { recursive: true, force: true });
    else console.error(`Failed workspace production fixture retained at ${project}`);
  }
}

await verifySelectedRuntime();

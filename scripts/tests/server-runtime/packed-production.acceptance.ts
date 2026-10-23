/** Runs the canonical command after candidate-only isolated installs, relocation and developer removal. */
import { strict as assert } from "node:assert";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  readManifests,
  loadReleaseTarballs,
  startRegistry,
} from "../../pack-and-smoke-create-relkit-pack.js";
import { preparePackedProduction } from "./production-packed-project.js";
import { selectedWorkerAssets } from "./standalone-assets.js";
import { verifyProductionNativeWorker, verifyProductionTask } from "./production-native-proof.js";
import { verifyStandaloneServer } from "./standalone-process.js";
import { preparePackedAuth } from "./production-auth-project.js";
import { verifyDockerProduction } from "./production-docker.js";
import {
  prepareProductionDatabase,
  PRODUCTION_AUTH_SECRET,
  verifyProductionAuth,
} from "./production-auth-proof.js";

/**
 * Retains failed fixture bytes while always stopping the registry and owned runtime children.
 * @returns After candidate-only native acceptance, bounded Docker proof and owned cleanup complete.
 */
async function verifyPackedProduction(): Promise<void> {
  const tarballs = process.argv[2];
  if (tarballs === undefined) throw new Error("Pass the fresh release tarball directory.");
  const root = await mkdtemp(join(tmpdir(), "relkit-packed-production-"));
  let registry: Awaited<ReturnType<typeof startRegistry>> | undefined;
  let passed = false;
  try {
    const manifests = await readManifests(resolve(import.meta.dirname, "../../.."));
    const candidates = await loadReleaseTarballs(resolve(tarballs));
    registry = await startRegistry(root, candidates, manifests);
    const variants = await preparePackedProduction(
      root,
      `http://127.0.0.1:${registry.port}`,
      manifests,
    );
    const auth = await preparePackedAuth(
      root,
      `http://127.0.0.1:${registry.port}`,
      manifests,
      candidates,
    );
    console.log(JSON.stringify(await exercisePackedProduction({ ...variants, auth }), null, 2));
    await verifyDockerProduction(auth.root, registry.port ?? 0);
    passed = true;
  } finally {
    await registry?.stop(true);
    if (passed) await rm(root, { recursive: true, force: true });
    else console.error(`Failed production fixture retained at ${root}`);
  }
}

/**
 * Exercises real HTTP, selected SDK rendering, native durable output and bounded SIGTERM.
 * @param variants - Independently installed and relocated minimal, native and auth cohorts.
 * @returns Separate observed minimal, native-worker and SQLite/auth acceptance facts.
 */
async function exercisePackedProduction(
  variants: Awaited<ReturnType<typeof preparePackedProduction>> & {
    auth: Awaited<ReturnType<typeof preparePackedAuth>>;
  },
) {
  const assets = await selectedWorkerAssets(variants.native.root);
  await verifyStandaloneServer(variants.minimal.root, async (url) => {
    const response = await fetch(`${url}/run`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: url },
      body: JSON.stringify({ value: 21 }),
      signal: AbortSignal.timeout(5_000),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { doubled: 42 });
  });
  await verifyStandaloneServer(variants.native.root, (url) =>
    verifyProductionNativeWorker(variants.native.root, url),
  );
  await exerciseProductionAuth(variants.auth.root);
  return {
    canonical: "NODE_ENV=production bun run --no-env-file .relkit/build/server/index.js",
    minimal: { ready: true, shutdown: 0, packages: variants.minimal.packages },
    auth: {
      ready: true,
      shutdown: 0,
      migratedTwice: true,
      rollback: true,
      patchedDeclarations: true,
      signupSessionSignoutSignin: true,
      jobsAlongsideAuth: { doubled: 42 },
      packages: variants.auth.packages,
    },
    selected: {
      ready: true,
      scalar: true,
      shutdown: 0,
      output: { doubled: 42 },
      workerAssets: assets,
      packages: variants.native.packages,
    },
  };
}

/**
 * Exercises authentication and a real durable worker in the same production generation.
 * @param root - Relocated auth cohort after its production-only candidate installation.
 * @returns After native auth, committed job output and joined server shutdown pass.
 */
async function exerciseProductionAuth(root: string): Promise<void> {
  const database = await prepareProductionDatabase(root);
  await cp(database, join(root, "pristine.sqlite"));
  await verifyStandaloneServer(
    root,
    async (url) => {
      await verifyProductionAuth(url);
      await verifyProductionTask(url, () =>
        readFile(join(root, ".relkit/state/jobs/default/native/records.ndjson"), "utf8"),
      );
    },
    { DATABASE_PATH: database, BETTER_AUTH_SECRET: PRODUCTION_AUTH_SECRET },
  );
}

await verifyPackedProduction();

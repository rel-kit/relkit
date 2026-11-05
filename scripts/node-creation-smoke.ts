/**
 * Prepares the Node creation smoke: packs this checkout (or reuses packed release artifacts),
 * verifies every archive against its workspace manifest, and writes a directory a machine
 * without Bun can use: `index.json` and `tarballs/` for the registry, plus `smoke.mjs`, the
 * bundled `node-creation-smoke-run.ts` that serves them and runs `npx create-relkit` /
 * `pnpm dlx create-relkit` and `<manager> run dev`.
 *
 *   bun scripts/node-creation-smoke.ts --out <dir> [--artifacts <packed release directory>]
 *   node <dir>/smoke.mjs --package-manager npm|pnpm --require-no-bun
 */
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Effect } from "effect";
import {
  loadReleaseTarballs,
  readManifests,
  readPackedManifest,
} from "./pack-and-smoke-create-relkit-pack.js";
import { registryPackages } from "./packed-registry-runtime.js";
import { packBaselineArtifacts } from "./dev-readiness/packed-artifacts.js";
import type { PreparedRegistryIndex } from "./node-creation-registry.js";

const root = resolve(import.meta.dir, "..");

/** Reads one `--name value` option. @param name - Option name. @returns Its value. */
function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? undefined : process.argv[index + 1];
}

async function main(): Promise<void> {
  const out = resolve(option("out") ?? join(root, ".relkit-node-smoke"));
  const artifacts = option("artifacts");
  const manifests = await readManifests(root);
  const temporary = await mkdtemp(join(tmpdir(), "relkit-node-smoke-pack-"));
  try {
    const tarballs =
      artifacts === undefined
        ? await Effect.runPromise(packBaselineArtifacts(temporary, manifests))
        : await loadReleaseTarballs(resolve(artifacts));
    const verified = await registryPackages(tarballs, manifests, readPackedManifest);
    await rm(out, { recursive: true, force: true });
    await mkdir(join(out, "tarballs"), { recursive: true });
    const packages: {
      manifest: PreparedRegistryIndex["packages"][number]["manifest"];
      tarball: string;
    }[] = [];
    let index = 0;
    for (const [name, manifest] of verified.manifests) {
      const tarball = `tarballs/${index++}.tgz`;
      await copyFile(tarballs.get(name)!, join(out, tarball));
      packages.push({ manifest, tarball });
    }
    const prepared: PreparedRegistryIndex = { workspace: [...verified.workspace], packages };
    await writeFile(join(out, "index.json"), JSON.stringify(prepared));
    const bundle = await Bun.build({
      entrypoints: [join(root, "scripts/node-creation-smoke-run.ts")],
      target: "node",
      format: "esm",
      outdir: out,
      naming: "smoke.mjs",
    });
    if (!bundle.success) throw new AggregateError(bundle.logs, "Bundling smoke.mjs failed.");
    console.log(`Prepared ${packages.length} candidate packages and smoke.mjs in ${out}`);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

if (import.meta.main) await main();

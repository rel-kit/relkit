/** Selects the packed `relkit` core archive, the creator that `relkit create` runs and the first-party archives a created app installs. */
import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  loadReleaseTarballs,
  readManifests,
  readPackedManifest,
} from "./pack-and-smoke-create-relkit-pack.js";
import type { Manifest } from "./scaffold-process.types.js";

const root = resolve(import.meta.dir, "..");

/**
 * Follows the packed manifests' runtime dependencies from the given roots to every first-party
 * archive they need. A missing first-party archive is an error, never a registry fallback.
 * @param archives - Candidate archive paths indexed by package name.
 * @param manifests - Current workspace package identities; their names are the first-party set.
 * @param roots - Packages whose closure is selected.
 * @returns Selected archive paths indexed by package name, roots first.
 */
export async function relkitArchiveClosure(
  archives: ReadonlyMap<string, string>,
  manifests: ReadonlyMap<string, { readonly manifest: Manifest }>,
  roots: readonly string[] = ["relkit"],
) {
  const selected = new Map<string, string>();
  const pending = [...roots];
  for (const name of pending) {
    if (selected.has(name)) continue;
    const archive = archives.get(name);
    assert.ok(archive, `Missing first-party archive: ${name}`);
    const manifest = await readPackedManifest(archive);
    selected.set(name, archive);
    for (const dependency of Object.keys({
      ...manifest.dependencies,
      ...manifest.optionalDependencies,
    }))
      if (manifests.has(dependency) && !selected.has(dependency)) pending.push(dependency);
  }
  return selected;
}

/**
 * Selects `relkit`'s own runtime closure and requires it to stay free of the CLI and compiler,
 * which production installs must not pull in (D1).
 * @param archives - Candidate archive paths indexed by package name.
 * @param manifests - Current workspace package identities.
 * @returns The packed `relkit` runtime closure.
 */
export async function relkitRuntimeClosure(
  archives: ReadonlyMap<string, string>,
  manifests: ReadonlyMap<string, { readonly manifest: Manifest }>,
) {
  const runtime = await relkitArchiveClosure(archives, manifests, ["relkit"]);
  assert.equal(runtime.has("@relkit/cli"), false, "relkit's runtime must not require @relkit/cli");
  for (const archive of runtime.values()) {
    const manifest = await readPackedManifest(archive);
    assert.equal(
      manifest.dependencies?.typescript,
      undefined,
      `${manifest.name} must not depend on typescript`,
    );
  }
  return runtime;
}

/** Reads the first-party packages the minimal template declares, which `relkit check` needs installed. */
async function templatePackages(manifests: ReadonlyMap<string, unknown>) {
  const template = JSON.parse(
    await readFile(resolve(root, "templates/default/v1/minimal/package.json"), "utf8"),
  ) as Manifest;
  return Object.keys({ ...template.dependencies, ...template.devDependencies }).filter((name) =>
    manifests.has(name),
  );
}

/** Reads package identities from the actual archives before the candidate registry starts. */
export async function wrapperArchiveInputs(artifacts: string) {
  const manifests = await readManifests(root);
  const all = await loadReleaseTarballs(artifacts);
  const runtime = await relkitRuntimeClosure(all, manifests);
  const selected = await relkitArchiveClosure(all, manifests, [
    "relkit",
    "create-relkit",
    ...(await templatePackages(manifests)),
  ]);
  const read = async (name: string) => {
    const archive = selected.get(name);
    assert.ok(archive, `Missing first-party archive: ${name}`);
    return readPackedManifest(archive);
  };
  const relkit = await read("relkit"),
    creator = await read("create-relkit"),
    cli = await read("@relkit/cli");
  assert.equal(cli.version, manifests.get("@relkit/cli")?.manifest.version);
  assert.equal(creator.dependencies?.relkit, relkit.version, "create-relkit must use this relkit");
  assert.equal(creator.dependencies?.typescript, undefined);
  return {
    manifests,
    selected,
    runtime: [...runtime.keys()],
    wrapperVersion: relkit.version,
    wrapperDependencies: relkit.dependencies ?? {},
    creatorVersion: creator.version,
    cliVersion: cli.version,
  };
}

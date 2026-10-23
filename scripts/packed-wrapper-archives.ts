/** Selects actual candidate creator runtime archives while retaining the complete first-party no-fallback registry policy. */
import { strict as assert } from "node:assert";
import { resolve } from "node:path";
import {
  loadReleaseTarballs,
  readManifests,
  readPackedManifest,
} from "./pack-and-smoke-create-relkit-pack.js";
import type { Manifest } from "./scaffold-process.types.js";

/** Selects only actual packed runtime dependencies; missing first-party archives never use a registry fallback. */
export async function wrapperArchiveClosure(
  archives: ReadonlyMap<string, string>,
  manifests: ReadonlyMap<string, { readonly manifest: Manifest }>,
) {
  const selected = new Map<string, string>();
  const pending = ["relkit"];
  for (const name of pending) {
    if (selected.has(name)) continue;
    const archive = archives.get(name);
    assert.ok(archive, `Missing wrapper runtime archive: ${name}`);
    const manifest = await readPackedManifest(archive);
    selected.set(name, archive);
    for (const dependency of Object.keys({
      ...manifest.dependencies,
      ...manifest.optionalDependencies,
    }))
      if (manifests.has(dependency) && !selected.has(dependency)) pending.push(dependency);
  }
  assert.equal(selected.has("create-relkit"), true, "Wrapper must delegate to its creator archive");
  assert.equal(
    selected.has("@relkit/cli"),
    false,
    "Wrapper runtime must not require the CLI archive",
  );
  assert.equal(
    selected.has("@relkit/compiler"),
    false,
    "Creator runtime must not require compiler archives",
  );
  return selected;
}

/** Reads independent package identities from actual archives before the selected registry starts. */
export async function wrapperArchiveInputs(artifacts: string) {
  const manifests = await readManifests(resolve(import.meta.dir, ".."));
  const all = await loadReleaseTarballs(artifacts);
  const selected = await wrapperArchiveClosure(all, manifests);
  const wrapperArchive = selected.get("relkit"),
    creatorArchive = selected.get("create-relkit"),
    cliArchive = all.get("@relkit/cli");
  assert.ok(wrapperArchive);
  assert.ok(creatorArchive);
  assert.ok(cliArchive);
  const wrapper = await readPackedManifest(wrapperArchive),
    creator = await readPackedManifest(creatorArchive);
  const cli = await readPackedManifest(cliArchive);
  assert.equal(cli.version, manifests.get("@relkit/cli")?.manifest.version);
  assert.deepEqual(wrapper.dependencies, { "create-relkit": creator.version });
  assert.equal(creator.dependencies?.typescript, undefined);
  return {
    manifests,
    selected,
    wrapperVersion: wrapper.version,
    creatorVersion: creator.version,
    cliVersion: cli.version,
  };
}

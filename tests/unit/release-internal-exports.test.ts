/** Verifies supported internal package exports name exact packed modules instead of pruned wildcard surfaces. */
import { expect, test } from "bun:test";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  readManifests,
  readPackedManifest,
} from "../../scripts/pack-and-smoke-create-relkit-pack.ts";
import { expectedExports } from "../../scripts/release-package-contract.ts";
import { assertListing } from "../../scripts/release-check-listing.ts";
import { bun, command, exportTargets, stable } from "../../scripts/release-check-support.ts";

const root = resolve(import.meta.dir, "../..");

test("release package export contracts contain no unbounded wildcard targets", async () => {
  const manifests = await readManifests(root);
  for (const [name, item] of manifests) {
    expect(JSON.stringify(item.manifest.exports), name).not.toContain("*");
    expect(stable(item.manifest.exports), name).toEqual(
      stable(expectedExports(item.directory.split("/").at(-1)!, name)),
    );
  }
});

test("all current creator, agent and testing internal callers have explicit owning exports", async () => {
  const manifests = await readManifests(root);
  let callers = 0;
  for (const directory of [
    "packages",
    "integrations",
    "scripts",
    "tests",
    "apps",
    "examples",
    "templates",
  ])
    for await (const file of new Bun.Glob("**/*.{ts,tsx,mts,cts}").scan({
      cwd: resolve(root, directory),
      onlyFiles: true,
    })) {
      if (/(?:^|\/)(?:dist|node_modules|\.next|\.relkit|content\/docs\/api)\//.test(file)) continue;
      const text = await readFile(resolve(root, directory, file), "utf8");
      for (const match of text.matchAll(
        /["']((create-relkit|@relkit\/(?:agents|testing))\/internal\/([^"']+))["']/g,
      )) {
        const owner = manifests.get(match[2]!);
        const exports = owner?.manifest.exports;
        expect(Object.keys(exports ?? {}), match[1]).toContain(`./internal/${match[3]}`);
        callers += 1;
      }
    }
  expect(callers).toBeGreaterThan(100);
});

test("real archives satisfy every explicit internal target and still reject a missing target", async () => {
  const directory = await mkdtemp(join(tmpdir(), "relkit-internal-exports-"));
  try {
    const manifests = await readManifests(root);
    for (const name of ["create-relkit", "@relkit/agents", "@relkit/testing"]) {
      const item = manifests.get(name)!;
      const before = new Set(await readdir(directory));
      await command(
        bun,
        ["pm", "pack", "--ignore-scripts", "--destination", directory, "--quiet"],
        item.directory,
        30_000,
      );
      const file = (await readdir(directory)).find(
        (entry) => entry.endsWith(".tgz") && !before.has(entry),
      )!;
      const archive = join(directory, file);
      const listing = (await command("tar", ["-tzf", archive], root, 30_000)).trim().split(/\r?\n/);
      const packed = await readPackedManifest(archive);
      const targets = exportTargets(packed.exports);
      for (const target of targets)
        expect(listing, `${name} -> ${target}`).toContain(`package/${target.slice(2)}`);
      const target = `package/${targets.find((entry) => entry.endsWith(".d.ts") && !entry.endsWith("/index.d.ts"))!.slice(2)}`;
      expect(() =>
        assertListing(
          { ...item, name },
          listing.filter((entry) => entry !== target),
          packed,
        ),
      ).toThrow("Packed export target is missing");
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);

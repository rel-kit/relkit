/** Verifies published export maps and packed declarations expose no `internal` module. */
import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { firstPartyExports } from "../../scripts/first-party-exports.ts";
import {
  readManifests,
  readPackedManifest,
} from "../../scripts/pack-and-smoke-create-relkit-pack.ts";
import { expectedExports } from "../../scripts/release-package-contract.ts";
import { assertListing } from "../../scripts/release-check-listing.ts";
import { bun, command, exportTargets, stable } from "../../scripts/release-check-support.ts";

const root = resolve(import.meta.dir, "../..");

/** Splits a bare specifier into its package name and export key. */
function packageSpecifier(specifier: string): { name: string; key: string } {
  const parts = specifier.split("/");
  const length = specifier.startsWith("@") ? 2 : 1;
  const rest = parts.slice(length).join("/");
  return { name: parts.slice(0, length).join("/"), key: rest ? `./${rest}` : "." };
}

/** Every module specifier a declaration file imports or re-exports. */
function declarationSpecifiers(text: string): string[] {
  return [...text.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)["']([^"']+)["']/g)].map(
    (match) => match[1]!,
  );
}

test("release package export contracts contain no unbounded wildcard targets", async () => {
  const manifests = await readManifests(root);
  for (const [name, item] of manifests) {
    expect(JSON.stringify(item.manifest.exports), name).not.toContain("*");
    expect(stable(item.manifest.exports), name).toEqual(
      stable(expectedExports(item.directory.split("/").at(-1)!, name)),
    );
  }
});

test("no published export path or target has an internal segment", async () => {
  const manifests = await readManifests(root);
  const published = new Set<string>();
  for (const [name, item] of manifests) {
    if (item.manifest.private) continue;
    for (const [key, target] of Object.entries(item.manifest.exports ?? {})) {
      const specifier = name + (key === "." ? "" : key.slice(1));
      published.add(specifier);
      expect(key.split("/"), specifier).not.toContain("internal");
      for (const path of exportTargets(target))
        expect(path.split("/"), `${specifier} -> ${path}`).not.toContain("internal");
    }
  }
  for (const specifier of firstPartyExports) expect(published, specifier).toContain(specifier);
});

test("packed declarations import only published, non-internal modules", async () => {
  const directory = await mkdtemp(join(tmpdir(), "relkit-declaration-scan-"));
  try {
    const manifests = await readManifests(root);
    let declarations = 0;
    for (const [name, item] of manifests) {
      if (item.manifest.private) continue;
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
      for (const target of exportTargets(packed.exports))
        expect(listing, `${name} -> ${target}`).toContain(`package/${target.slice(2)}`);
      const extracted = join(directory, file.replace(/\.tgz$/, ""));
      await mkdir(extracted);
      await command("tar", ["-xzf", archive, "-C", extracted], root, 30_000);
      for (const entry of listing.filter((path) => /\.d\.[cm]?ts$/.test(path))) {
        declarations += 1;
        const path = join(extracted, entry);
        for (const specifier of declarationSpecifiers(await readFile(path, "utf8"))) {
          const where = `${name}: ${entry} imports ${specifier}`;
          if (specifier.startsWith(".")) {
            const target = relative(join(extracted, "package"), resolve(dirname(path), specifier));
            expect(target.split("/"), where).not.toContain("internal");
            expect(target.startsWith(".."), where).toBe(false);
            continue;
          }
          const { name: owner, key } = packageSpecifier(specifier);
          expect(key.split("/"), where).not.toContain("internal");
          const workspace = manifests.get(owner);
          if (!workspace) continue;
          expect(workspace.manifest.private ?? false, where).toBe(false);
          expect(Object.keys(workspace.manifest.exports ?? {}), where).toContain(key);
        }
      }
      if (name === "relkit") {
        const target = `package/${exportTargets(packed.exports)
          .find((entry) => entry.endsWith(".d.ts") && !entry.endsWith("/index.d.ts"))!
          .slice(2)}`;
        expect(() =>
          assertListing(
            { ...item, name },
            listing.filter((entry) => entry !== target),
            packed,
          ),
        ).toThrow("Packed export target is missing");
      }
    }
    expect(declarations).toBeGreaterThan(1000);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 300_000);

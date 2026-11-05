/** Every published package lists the runtimes it supports, and Bun-only packages still need Bun. */
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import {
  BUN_ENGINE,
  BUN_ONLY_PACKAGES,
  NODE_ENGINE,
  packageEngines,
} from "../../scripts/package-engines.ts";
import { workspacePackageDirectories } from "../../scripts/workspace-packages.ts";

const root = resolve(import.meta.dir, "../..");
const manifests = workspacePackageDirectories(root).map((directory) => ({
  directory: relative(root, directory),
  manifest: JSON.parse(readFileSync(join(directory, "package.json"), "utf8")) as {
    readonly name: string;
    readonly private?: boolean;
    readonly engines?: Record<string, string>;
  },
}));
const published = manifests.filter(({ manifest }) => manifest.private !== true);

test("each published manifest declares the engines its package supports", () => {
  expect(published.length).toBeGreaterThan(20);
  for (const { manifest } of published)
    expect({ [manifest.name]: manifest.engines }).toEqual({
      [manifest.name]: packageEngines(manifest.name),
    });
});

test("framework packages list Bun and Node LTS", () => {
  const both = published.filter(({ manifest }) => !(manifest.name in BUN_ONLY_PACKAGES));
  expect(both.map(({ manifest }) => manifest.name)).toEqual(
    expect.arrayContaining(["relkit", "@relkit/client", "@relkit/redis", "@relkit/drizzle"]),
  );
  for (const { manifest } of both) {
    expect(manifest.engines?.bun).toBe(BUN_ENGINE);
    expect(manifest.engines?.node).toMatch(/^>=2[0-9]\./);
  }
  expect(packageEngines("relkit")).toEqual({ bun: BUN_ENGINE, node: NODE_ENGINE });
});

test("a Bun-only package still has Bun call sites outside adapters", () => {
  const baseline = JSON.parse(
    readFileSync(join(root, "scripts/portability-baseline.json"), "utf8"),
  ) as Record<string, { readonly bun?: number }>;
  for (const name of Object.keys(BUN_ONLY_PACKAGES)) {
    const directory = published.find(({ manifest }) => manifest.name === name)?.directory;
    expect(directory, name).toBeDefined();
    const sites = Object.entries(baseline).filter(
      ([file, kinds]) => file.startsWith(`${directory}/`) && (kinds.bun ?? 0) > 0,
    );
    expect(
      sites.length,
      `${name} has no Bun call sites left; list Node in its engines`,
    ).toBeGreaterThan(0);
  }
});

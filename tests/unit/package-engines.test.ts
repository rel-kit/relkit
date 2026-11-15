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

/** One file's entry in `scripts/portability-baseline.json`. */
type BaselineEntry = {
  readonly bun?: number;
  readonly node?: number;
  /** Why the Bun call sites may stay in a package that declares Node. */
  readonly reason?: string;
  /** The runtime check that keeps them off Node. */
  readonly guard?: string;
};
const baseline = JSON.parse(
  readFileSync(join(root, "scripts/portability-baseline.json"), "utf8"),
) as Record<string, BaselineEntry>;

/**
 * Lists Bun call sites a package that declares Node keeps on the baseline without saying why.
 * @param entries - Baseline entries by file.
 * @returns One message per such file, naming the package and the file.
 */
function unexplainedBunSites(entries: Record<string, BaselineEntry>): string[] {
  const problems: string[] = [];
  for (const { directory, manifest } of published) {
    if (manifest.engines?.node === undefined) continue;
    for (const [file, entry] of Object.entries(entries)) {
      if (!file.startsWith(`${directory}/`) || (entry.bun ?? 0) === 0) continue;
      if (!entry.reason?.trim() || !entry.guard?.trim())
        problems.push(
          `${manifest.name} declares Node but ${file} keeps ${entry.bun} Bun call site(s) on the portability baseline without a "reason" and a "guard"`,
        );
    }
  }
  return problems;
}

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

test("a package that declares Node keeps Bun call sites only with a reason and a runtime guard", () => {
  expect(unexplainedBunSites(baseline)).toEqual([]);
});

test("the launcher's former allow-list entry fails the check", () => {
  expect(
    unexplainedBunSites({ "packages/inspector/src/ui-native.service.ts": { bun: 3 } }),
  ).toEqual([
    '@relkit/inspector declares Node but packages/inspector/src/ui-native.service.ts keeps 3 Bun call site(s) on the portability baseline without a "reason" and a "guard"',
  ]);
});

test("a Bun-only package still has Bun call sites outside adapters", () => {
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

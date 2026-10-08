import { expect, test } from "bun:test";
import { join } from "node:path";
import { releaseNotes } from "../../scripts/release-check.ts";
import { publicationOrder } from "../../scripts/release-check-artifacts.ts";
import { checkManifests, packages, readJson, root } from "../../scripts/release-check-support.ts";

test("accepts the unscoped CLI package and publishes its dependency first", async () => {
  const items = await packages();
  const wrapper = items.find((item) => item.name === "relkit");
  expect(wrapper).toBeDefined();
  const manifest = await readJson(join(root, "package.json"));
  const checked = checkManifests(items, manifest);
  expect(checked.summary.find((item) => item.name === "relkit")?.workspaceDependencies).toEqual([
    "@relkit/cli",
  ]);
  const ordered = publicationOrder(items).map((item) => item.name);
  expect(ordered.indexOf("relkit")).toBeGreaterThan(ordered.indexOf("@relkit/cli"));
  expect(() =>
    checkManifests(
      items.map((item) => (item === wrapper ? { ...item, name: "@relkit/relkit" } : item)),
      manifest,
    ),
  ).toThrow("Package name mismatch: packages/relkit");
});

test("tracked release notes exclude rebuild-dependent tarball hashes", () => {
  const notes = releaseNotes({
    version: "0.0.1",
    inputFingerprint: "input",
    packageManager: "bun@1.3.10",
    packages: [
      {
        name: "@relkit/app",
        version: "0.0.1",
        exports: { ".": "./dist/index.js" },
        dependencyFields: { dependencies: {} },
      },
    ],
    templates: [],
    artifacts: [{ sha256: "unstable-hash", integrity: "unstable-integrity" }],
  });

  expect(notes).not.toContain("unstable-hash");
  expect(notes).not.toContain("unstable-integrity");
  expect(notes).toContain("attached\nrelease manifest and checksum files");
  expect(notes).toContain("Archive checks run during publication");
  expect(notes).not.toContain("packed-artifact, template, declaration");
});

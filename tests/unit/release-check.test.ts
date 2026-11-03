/** Checks the creation evidence summary (and full reports after certification), lightweight wrapper publication order and stable release notes. */
import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { releaseNotes } from "../../scripts/release-check.ts";
import { publicationOrder } from "../../scripts/release-check-artifacts.ts";
import { checkManifests, packages, readJson, root } from "../../scripts/release-check-support.ts";
import { validateCreationReport } from "../../scripts/release-create-evidence.ts";
import { CREATION_SUMMARIES, EVIDENCE_REPORTS } from "../../scripts/release-evidence.ts";
import { expectedTemplateScripts, packedTemplates } from "../../scripts/release-templates.ts";
import {
  assertCreateCapability,
  currentCreateCapabilityIdentity,
  CREATE_CAPABILITY_TABLE,
} from "../../packages/create-relkit/src/create-capabilities.ts";

test("release template contracts preserve canonical emitted-JavaScript startup", async () => {
  for (const template of packedTemplates) {
    const manifest = await readJson(join(root, "templates/default/v1", template, "package.json"));
    const scripts = expectedTemplateScripts(template);
    expect(scripts).toEqual(manifest.scripts);
    expect(scripts.start).toBe(
      "NODE_ENV=production bun run --no-env-file .relkit/build/server/index.js",
    );
  }
});

test("the release reports default creation as tested for its actual tool identity", () => {
  expect(CREATE_CAPABILITY_TABLE.entries[0]?.identity).toEqual(currentCreateCapabilityIdentity());
  expect(() =>
    assertCreateCapability({ template: "minimal", cloud: "none", deploy: "none", examples: true }),
  ).not.toThrow();
});

for (const set of ["fresh", "restart"] as const) {
  test(`the release keeps a passing ${set} summary and, after certification, its complete report`, async () => {
    const entry = CREATE_CAPABILITY_TABLE.entries[0]!;
    const summary = readFileSync(
      join(root, CREATION_SUMMARIES, `${entry.identity.release}.md`),
      "utf8",
    );
    expect(summary).toMatch(
      new RegExp(`^\\|\\s*${set}\\s*\\|\\s*20\\s*\\|\\s*passed\\s*\\|`, "mu"),
    );
    // Full reports exist only where certification ran; CI uploads them as artifacts.
    const path = join(root, EVIDENCE_REPORTS, entry[`${set}Evidence`]);
    if (existsSync(path))
      expect(() =>
        validateCreationReport(JSON.parse(readFileSync(path, "utf8")), entry, set),
      ).not.toThrow();
  });
}

test("publishes the core package before the creator that depends on it", async () => {
  const items = await packages();
  const wrapper = items.find((item) => item.name === "relkit");
  expect(wrapper).toBeDefined();
  const manifest = await readJson(join(root, "package.json"));
  const checked = checkManifests(items, manifest);
  expect(checked.summary.find((item) => item.name === "relkit")?.workspaceDependencies).toEqual([]);
  const ordered = publicationOrder(items).map((item) => item.name);
  expect(ordered.indexOf("relkit")).toBeLessThan(ordered.indexOf("create-relkit"));
  expect(() =>
    checkManifests(
      items.map((item) =>
        item.name === "@relkit/app" ? { ...item, name: "@relkit/legacy-app" } : item,
      ),
      manifest,
    ),
  ).toThrow("Package name mismatch: packages/app");
});

test("tracked release notes exclude rebuild-dependent tarball hashes", () => {
  const notes = releaseNotes({
    version: "0.0.1",
    inputFingerprint: "input",
    packageManager: "bun@1.3.10",
    packages: [
      {
        name: "relkit",
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
  expect(notes).toContain("## Changes\n\nNo changelog entry for this release.");
});

test("release notes list the release's changelog groups", () => {
  const notes = releaseNotes({
    version: "0.0.2",
    inputFingerprint: "input",
    packageManager: "bun@1.3.10",
    changes:
      "### Breaking\n\n- Rename. [Migration](https://relkit.dev/docs/guides/migrate)\n\n### Fixed\n\n- Fix.",
    packages: [],
    templates: [],
  });
  expect(notes).toContain(
    "## Changes\n\n### Breaking\n\n- Rename. [Migration](https://relkit.dev/docs/guides/migrate)\n\n### Fixed\n\n- Fix.\n",
  );
});

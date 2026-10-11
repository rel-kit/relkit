import { expect, test } from "bun:test";
import { join } from "node:path";
import { releaseNotes } from "../../scripts/release-check.ts";
import { publicationOrder } from "../../scripts/release-check-artifacts.ts";
import { checkManifests, packages, readJson, root } from "../../scripts/release-check-support.ts";
import {
  assertCreateCapability,
  currentCreateCapabilityIdentity,
  CREATE_CAPABILITY_TABLE,
} from "../../packages/create-relkit/src/create-capabilities.ts";

test("the release certifies default creation using its actual tool identity", () => {
  expect(CREATE_CAPABILITY_TABLE.entries[0]?.identity).toEqual(currentCreateCapabilityIdentity());
  expect(() =>
    assertCreateCapability({ template: "minimal", cloud: "none", deploy: "none", examples: true }),
  ).not.toThrow();
});

for (const set of ["fresh", "restart"] as const) {
  test(`the release retains complete ${set} certification for its actual tool identity`, async () => {
    const entry = CREATE_CAPABILITY_TABLE.entries[0]!;
    const report = await readJson(join(root, entry[`${set}Evidence`]));
    const identity = currentCreateCapabilityIdentity();
    expect(report).toMatchObject({
      protocol: "relkit.dev-readiness",
      version: 1,
      mode: "candidate-certification",
      set,
      command: "bun dev",
      thresholdMs: 1_000,
      fixture: { version: identity.release, examples: "examples" },
      identity: {
        bun: { version: identity.bun },
        cli: { version: identity.release },
        typescript: { version: identity.typescript },
      },
      summary: { runs: 20, passed: true, preparationPassed: true },
    });
    expect(report.attempts).toHaveLength(20);
    for (const attempt of report.attempts) {
      expect(attempt.sample?.outcome).toBe("response");
      expect(attempt.sample.durationMs).toBeLessThan(report.thresholdMs);
    }
  });
}

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

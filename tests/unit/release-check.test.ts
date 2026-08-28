import { expect, test } from "bun:test";
import { releaseNotes } from "../../scripts/release-check.ts";

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
});

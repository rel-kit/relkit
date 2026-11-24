/** Checks that only the generated release pull request with version-derived changes gets the reduced CI suite. */
import { expect, test } from "bun:test";
import { versionOnlyRelease } from "../../scripts/release-pr-scope.ts";

const repository = "rel-kit/relkit";
const release = { headRef: "changeset-release/main", headRepository: repository, repository };
// Path shapes taken from the 0.9.1, 0.9.2 and 0.9.3 version commits.
const derived = [
  ".changeset/quiet-pans-wave.md",
  ".changeset/release.json",
  "CHANGELOG.md",
  "RELEASE_NOTES.md",
  "bun.lock",
  "packages/relkit/package.json",
  "packages/cli/CHANGELOG.md",
  "integrations/packages/redis/package.json",
  "integrations/packages/redis/CHANGELOG.md",
  "packages/create-relkit/src/create-capabilities.ts",
  "templates/default/README.md",
  "templates/default/v1/minimal/package.json",
  "docs/evidence/create-capabilities/0.9.3.md",
  "apps/docs/content/_snippets/generated/installations/redis.mdx",
  "apps/docs/content/_snippets/source/templates/default/v1/minimal/package.json",
  "apps/docs/content/docs/api/cli.mdx",
];

test("the release branch with only version-derived paths is version-only", () => {
  expect(versionOnlyRelease({ ...release, paths: derived })).toBe(true);
});

test("any other path, branch or repository keeps the full suite", () => {
  for (const path of [
    "packages/relkit/src/index.ts",
    "packages/create-relkit/src/create.ts",
    "package.json",
    "scripts/release-pr-scope.ts",
    ".github/workflows/checks.yml",
    "templates/default/v1/minimal/src/index.ts",
    "apps/docs/content/docs/api/other.mdx",
    "docs/evidence/README.md",
    "integrations/redis/package.json",
  ])
    expect(versionOnlyRelease({ ...release, paths: [...derived, path] })).toBe(false);
  expect(versionOnlyRelease({ ...release, paths: [] })).toBe(false);
  expect(versionOnlyRelease({ ...release, headRef: "feature", paths: derived })).toBe(false);
  expect(versionOnlyRelease({ ...release, headRepository: "fork/relkit", paths: derived })).toBe(
    false,
  );
  expect(
    versionOnlyRelease({
      headRef: release.headRef,
      headRepository: "",
      repository: "",
      paths: derived,
    }),
  ).toBe(false);
});

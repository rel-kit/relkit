import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

test("fast CI gates merges and only green main runs start releases", async () => {
  const root = resolve(import.meta.dir, "../..");
  const [checks, release, verify, testAll] = await Promise.all([
    readFile(resolve(root, ".github/workflows/checks.yml"), "utf8"),
    readFile(resolve(root, ".github/workflows/ci.yml"), "utf8"),
    readFile(resolve(root, "scripts/verify.ts"), "utf8"),
    readFile(resolve(root, "scripts/test-all.ts"), "utf8"),
  ]);

  expect(checks).toContain("name: CI");
  expect(checks).toContain("name: CI Gate");
  expect(checks).toContain("name: Static checks");
  expect(checks).toContain("name: Types and focused tests");
  expect(checks).toContain("bun x turbo run typecheck");
  expect(checks).toContain('gh workflow run checks.yml --ref "$HEAD_REF"');
  expect(checks).toContain("github.ref == 'refs/heads/changeset-release/main'");
  expect(checks).toContain('gh api --method POST "repos/$GITHUB_REPOSITORY/statuses/$HEAD_SHA"');
  expect(checks).not.toContain("bun run test:scaffold");
  expect(checks).not.toContain("aws-cloud");
  expect(release).toContain("workflows: [CI]");
  expect(release).toContain("github.event.workflow_run.conclusion == 'success'");
  expect(release).toContain("github.event.workflow_run.head_branch == 'main'");
  expect(release).toContain(
    "github.event.workflow_run.head_repository.full_name == github.repository",
  );
  expect(release).toContain("gh workflow run checks.yml --ref main");
  expect(release).toContain("--ci-pack --output");
  expect(release).toContain("needs.pack.result == 'success'");
  expect(release).not.toContain("aws-cloud");
  expect(release).not.toContain("schedule:");
  expect(verify).toContain('await run("package tests", bun, ["run", "test:packages"]);');
  expect(testAll).toContain('"test:packages"');
});

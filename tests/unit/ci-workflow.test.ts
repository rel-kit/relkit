import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

test("release jobs run after green dependencies with skipped optional jobs", async () => {
  const workflow = await readFile(
    resolve(import.meta.dir, "../../.github/workflows/ci.yml"),
    "utf8",
  );

  expect(workflow).toContain(
    "(github.event_name == 'push' || github.event_name == 'workflow_dispatch') &&",
  );
  expect(workflow).toContain("gh workflow run ci.yml --ref main");
  expect(workflow).toContain(
    "if: always() && needs.select-release-mode.result == 'success' && needs.select-release-mode.outputs.mode == 'version'",
  );
  expect(workflow).toContain(
    "if: always() && needs.select-release-mode.result == 'success' && needs.select-release-mode.outputs.mode == 'publish'",
  );
  expect(workflow).toContain("always() && needs.pack.result == 'success' &&");
  expect(workflow).toContain("github.ref == 'refs/heads/changeset-release/main'");
  expect(workflow).toContain('gh api --method POST "repos/$GITHUB_REPOSITORY/statuses/$HEAD_SHA"');
});

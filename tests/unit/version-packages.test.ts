import { expect, test } from "bun:test";
import { renderActionChangelog, renderChangelog } from "../../scripts/version-packages.ts";

test("the release train promotes Unreleased into one root changelog entry", () => {
  expect(
    renderChangelog(
      "# Changelog\n\n## Unreleased — Breaking\n\n- Existing change.\n\n## 0.0.0\n\n- Bootstrap.\n",
      "0.0.1",
      ["New public API.", "Existing change."],
    ),
  ).toBe(
    "# Changelog\n\n## Unreleased\n\n## 0.0.1 — Breaking\n\n- Existing change.\n\n### Changes\n\n- New public API.\n\n## 0.0.0\n\n- Bootstrap.\n",
  );
});

test("the Changesets action receives an untracked package changelog", () => {
  expect(renderActionChangelog("@relkit/app", "0.0.1")).toBe(
    "# @relkit/app\n\n## 0.0.1\n\nSee the root CHANGELOG.md for this fixed release train.\n",
  );
});

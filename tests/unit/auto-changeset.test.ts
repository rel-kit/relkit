import { expect, test } from "bun:test";
import {
  affectedPackages,
  changedPathArguments,
  hasCurrentChangeset,
  isChangeset,
  renderChangeset,
} from "../../scripts/auto-changeset.ts";

const packages = new Map([
  ["packages/app", "@relkit/app"],
  ["packages/cli", "@relkit/cli"],
  ["packages/create-relkit", "create-relkit"],
  ["packages/schema", "@relkit/schema"],
  ["integrations/catalog", "@relkit/integrations"],
  ["integrations/packages/redis", "@relkit/redis"],
]);

test("release paths map to their published packages", () => {
  expect(
    affectedPackages(
      [
        "packages/schema/src/index.ts",
        "integrations/catalog/src/index.ts",
        "integrations/packages/redis/src/runtime/index.ts",
        "templates/default/v1/minimal/package.json",
        "apps/inspector/app/page.tsx",
        "docs/getting-started.md",
      ],
      packages,
    ),
  ).toEqual([
    "@relkit/cli",
    "@relkit/integrations",
    "@relkit/redis",
    "@relkit/schema",
    "create-relkit",
  ]);
});

test("shared packaged inputs release the fixed train", () => {
  expect(affectedPackages(["LICENSE"], packages)).toEqual([
    "@relkit/app",
    "@relkit/cli",
    "@relkit/integrations",
    "@relkit/redis",
    "@relkit/schema",
    "create-relkit",
  ]);
});

test("Changesets are detected and rendered deterministically", () => {
  expect(isChangeset(".changeset/quiet-cats.md")).toBe(true);
  expect(isChangeset(".changeset/README.md")).toBe(false);
  expect(renderChangeset(["create-relkit", "@relkit/schema"], "Ship schema changes.")).toBe(
    '---\n"@relkit/schema": patch\n"create-relkit": patch\n---\n\nShip schema changes.\n',
  );
});

test("release diffs retain deletions and both sides of renames", () => {
  expect(changedPathArguments("base", "head")).toEqual([
    "diff",
    "--no-renames",
    "--name-only",
    "-z",
    "base...head",
  ]);
});

test("a deleted Changeset does not satisfy release policy", () => {
  const paths = [".changeset/deleted.md", ".changeset/current.md"];
  expect(hasCurrentChangeset(paths, (path) => path.endsWith("current.md"))).toBe(true);
  expect(hasCurrentChangeset([paths[0]!], () => false)).toBe(false);
});

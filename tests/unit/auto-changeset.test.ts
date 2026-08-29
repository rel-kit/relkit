import { expect, test } from "bun:test";
import { affectedPackages, isChangeset, renderChangeset } from "../../scripts/auto-changeset.ts";

const packages = new Map([
  ["app", "@relkit/app"],
  ["cli", "@relkit/cli"],
  ["create-relkit", "create-relkit"],
  ["schema", "@relkit/schema"],
]);

test("release paths map to their published packages", () => {
  expect(
    affectedPackages(
      [
        "packages/schema/src/index.ts",
        "templates/default/v1/minimal/package.json",
        "apps/inspector/app/page.tsx",
        "docs/getting-started.md",
      ],
      packages,
    ),
  ).toEqual(["@relkit/cli", "@relkit/schema", "create-relkit"]);
});

test("shared packaged inputs release the fixed train", () => {
  expect(affectedPackages(["LICENSE"], packages)).toEqual([
    "@relkit/app",
    "@relkit/cli",
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

/**
 * Checks the release deprecates the final `@relkit/app` with a message that points to `relkit`
 * and the migration guide, that only packages in the published batch are deprecated, and that
 * the beta rehearsal runs on pull requests.
 */
import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { deprecationCommands, releaseDeprecations } from "../../scripts/release-deprecations.ts";

const root = resolve(import.meta.dir, "../..");

test("the release deprecates the final @relkit/app toward relkit and the migration guide", () => {
  expect(releaseDeprecations["@relkit/app"]).toContain("relkit migrate");
  expect(releaseDeprecations["@relkit/app"]).toContain(
    "https://relkit.dev/guides/migrate/relkit-0-9",
  );
  expect(
    deprecationCommands([
      { name: "relkit", version: "0.9.0" },
      { name: "@relkit/app", version: "0.9.0" },
    ]),
  ).toEqual([["deprecate", "@relkit/app@0.9.0", releaseDeprecations["@relkit/app"]!]]);
});

test("publishing runs the deprecations and pull requests rehearse the beta", async () => {
  const publish = await readFile(resolve(root, "scripts/publish-release.ts"), "utf8");
  expect(publish).toContain("deprecationCommands(manifest.packages)");
  const readiness = await readFile(
    resolve(root, ".github/workflows/release-readiness.yml"),
    "utf8",
  );
  expect(readiness).toContain("bun scripts/rehearse-beta.ts");
  const app = JSON.parse(await readFile(resolve(root, "packages/app/package.json"), "utf8"));
  expect(app.dependencies).toEqual({ relkit: "workspace:*" });
  expect(await readFile(resolve(root, "packages/app/src/index.ts"), "utf8")).toContain(
    'export * from "relkit/app";',
  );
});

/** Exercises the actual boundary CLI so docs build allowances cannot authorize site runtime imports or unrelated source dependencies. */
import { expect, test } from "bun:test";
import { posix } from "node:path";
import { execute, boundaryScript, withFixture } from "./phase0-harness.js";
import { packageFiles } from "./phase0-contracts.js";

/** Checks one exact source/target pair through the native scanner and existing fixture owner.
 * @param source - Repository-relative importing file.
 * @param target - Repository-relative foreign module.
 * @param allowed - Whether this build-only edge is explicitly approved.
 * @returns Completion after the scanner's ownership decision and joined cleanup.
 */
async function docsImport(source: string, target: string, allowed: boolean): Promise<void> {
  const relative = posix.relative(posix.dirname(source), target);
  const files = {
    ...packageFiles([
      { path: "apps/docs", name: "@relkit/docs", source: "" },
      { path: "packages/runtime-hono", name: "@relkit/runtime-hono", source: "" },
    ]),
    [source]: `import ${JSON.stringify(relative)};`,
    [target.replace(/\.js$/, ".ts")]: "export {};",
  };
  await withFixture(files, async (fixture) => {
    const result = await execute(process.execPath, ["run", boundaryScript, fixture]);
    if (allowed) expect(result.exitCode).toBe(0);
    else {
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain("cross-package-relative-import");
    }
  });
}

test("docs build imports allow only the selected pure transport metadata leaf", () =>
  docsImport(
    "apps/docs/scripts/installation-catalog.ts",
    "packages/runtime-hono/src/selected-transports.js",
    true,
  ));

test("docs build imports reuse the existing packed consumer process owner", () =>
  docsImport(
    "apps/docs/scripts/installation-workflow-project.ts",
    "scripts/scaffold-process.js",
    true,
  ));

test("the API audit reuses only the workspace package inventory helper", () =>
  docsImport("apps/docs/scripts/public-api-manifests.ts", "scripts/workspace-packages.js", true));

test("materialized source includes are content, while the owning source stays checked", () =>
  docsImport(
    "apps/docs/content/_snippets/source/example.ts",
    "packages/runtime-hono/src/create-app.js",
    true,
  ));

for (const [source, target] of [
  ["apps/docs/app/page.tsx", "packages/runtime-hono/src/selected-transports.js"],
  ["apps/docs/app/page.tsx", "scripts/scaffold-process.js"],
  ["apps/docs/scripts/installation-catalog.ts", "packages/runtime-hono/src/create-app.js"],
  ["apps/docs/scripts/installation-workflow-project.ts", "scripts/release-check.js"],
  ["apps/docs/scripts/public-api-manifests.ts", "scripts/release-check.js"],
  ["apps/docs/app/page.tsx", "scripts/workspace-packages.js"],
] as const) {
  test(`docs build imports still reject ${source} → ${target}`, () =>
    docsImport(source, target, false));
}

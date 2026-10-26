/** The standalone tool participates in the same strict manifest contract as every published package. */
import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { checkManifests, packages, exportTargets } from "../../scripts/release-check-support.js";
import { assertListing } from "../../scripts/release-check-listing.js";

test("release metadata recognizes the independent tool binary and Node prerequisite", async () => {
  const items = await packages();
  const root = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
  expect(
    checkManifests(items, root).summary.some((item) => item.name === "@relkit/inspector"),
  ).toBe(true);
  const tool = items.find((item) => item.name === "@relkit/inspector")!;
  expect(() =>
    checkManifests(
      items.map((item) =>
        item === tool ? { ...tool, manifest: { ...tool.manifest, bin: {} } } : item,
      ),
      root,
    ),
  ).toThrow("Binary map mismatch");
  expect(() =>
    checkManifests(
      items.map((item) =>
        item === tool
          ? { ...tool, manifest: { ...tool.manifest, engines: { bun: ">=1.3.10" } } }
          : item,
      ),
      root,
    ),
  ).toThrow("Release metadata mismatch");
});

test("archive policy requires tool UI assets and rejects retired CLI payloads", async () => {
  const items = await packages();
  const tool = items.find((item) => item.name === "@relkit/inspector")!;
  const common = [
    "package/LICENSE",
    "package/README.md",
    "package/package.json",
    "package/dist/index.js",
    "package/dist/index.d.ts",
    "package/dist/bin.js",
  ];
  const ui = [
    "package/dist/ui/server.js",
    "package/dist/ui/package.json",
    "package/dist/ui/.next/BUILD_ID",
    "package/dist/ui/.next/static/chunks/main.js",
  ];
  expect(() => assertListing(tool, common, tool.manifest)).toThrow(
    "Packed inspector asset is missing",
  );
  expect(() => assertListing(tool, [...common, ...ui], tool.manifest)).not.toThrow();
  const cli = items.find((item) => item.name === "@relkit/cli")!;
  const cliExports = exportTargets(cli.manifest.exports).map(
    (path) => `package/${path.replace(/^\.\//, "")}`,
  );
  expect(() =>
    assertListing(
      cli,
      [...common, ...cliExports, "package/editor/package.json", "package/dist/inspector/server.js"],
      cli.manifest,
    ),
  ).toThrow("retired inspector ownership");
});

test("container image acceptance is required by CI without publication authority", async () => {
  const workflow = Bun.YAML.parse(
    await readFile(new URL("../../.github/workflows/checks.yml", import.meta.url), "utf8"),
  );
  const image = workflow.jobs["inspector-container"];
  expect(image.permissions).toEqual({ contents: "read" });
  expect(image.steps.some((step: { run?: string }) => step.run === "bun run test:container")).toBe(
    true,
  );
  expect(workflow.jobs["ci-gate"].needs).toContain("inspector-container");
  expect(workflow.jobs["ci-gate"].steps[0].run).toContain(
    'test "$INSPECTOR_CONTAINER_RESULT" = success',
  );
});

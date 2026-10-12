import { expect, test } from "bun:test";
import { assertListing } from "../../scripts/release-check-listing.ts";
import type { PackageInfo } from "../../scripts/release-check-support.ts";
import { packedTemplates } from "../../scripts/release-templates.ts";

const catalogAssets = [
  "package/src/catalog-resolution.ts",
  "package/src/catalog-resolution.types.ts",
];
const metadata = ["package/LICENSE", "package/README.md", "package/package.json"];
const generator: PackageInfo = { name: "create-relkit", directory: "/fixture", manifest: {} };
const templateFiles = [
  "package.json",
  "gitignore",
  ".agents/skills/relkit/SKILL.md",
  ".agents/skills/relkit/references/cli.md",
  ".agents/skills/relkit/references/config-environments.md",
  ".agents/skills/relkit/references/domain-apis.md",
  ".agents/skills/relkit/references/http-apis.md",
  ".agents/skills/relkit/references/streaming-apis.md",
  ".agents/skills/relkit/references/jobs-apis.md",
  ".agents/skills/relkit/references/agent-apis.md",
  ".agents/skills/relkit/references/data-apis.md",
  ".agents/skills/relkit/references/realtime-apis.md",
  ".agents/skills/relkit/references/observability-apis.md",
];
const completeGenerator = [
  ...metadata,
  ...catalogAssets,
  ...packedTemplates.flatMap((template) =>
    templateFiles.map((file) => `package/dist/templates/default/v1/${template}/${file}`),
  ),
];

test("accepts the complete generator's exact portable catalog source pair", () => {
  expect(() => assertListing(generator, completeGenerator, {})).not.toThrow();
});

for (const template of packedTemplates)
  test(`requires the relkit skill in the ${template} template`, () => {
    const skill = `package/dist/templates/default/v1/${template}/.agents/skills/relkit/SKILL.md`;
    expect(() =>
      assertListing(
        generator,
        completeGenerator.filter((path) => path !== skill),
        {},
      ),
    ).toThrow(
      `Packed create-relkit template is missing: ${template}/.agents/skills/relkit/SKILL.md`,
    );
  });

test("retains development-file rejection beside approved catalog assets", () => {
  for (const rogue of [
    "package/src/generator-runtime.ts",
    "package/src/catalog-resolution.extra.ts",
    "package/src/nested/catalog-resolution.ts",
    "package/dist/rogue.ts",
  ])
    expect(() => assertListing(generator, [...completeGenerator, rogue], {})).toThrow(
      `Packed development files found in create-relkit: ${rogue}`,
    );
});

for (const missing of catalogAssets)
  test(`requires the portable catalog asset ${missing} even without an export target`, () => {
    expect(() =>
      assertListing(
        generator,
        completeGenerator.filter((path) => path !== missing),
        {},
      ),
    ).toThrow(`Packed create-relkit catalog asset is missing: ${missing}`);
  });

test("forbids the same catalog source pair in every unrelated package", () => {
  const unrelated: PackageInfo = { name: "@relkit/contracts", directory: "/fixture", manifest: {} };
  for (const asset of catalogAssets)
    expect(() => assertListing(unrelated, [...metadata, asset], {})).toThrow(
      `Packed development files found in @relkit/contracts: ${asset}`,
    );
});

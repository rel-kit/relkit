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
const completeGenerator = [
  ...metadata,
  ...catalogAssets,
  ...packedTemplates.flatMap((template) =>
    ["package.json", "gitignore"].map(
      (file) => `package/dist/templates/default/v1/${template}/${file}`,
    ),
  ),
];

test("accepts the complete generator's exact portable catalog source pair", () => {
  expect(() => assertListing(generator, completeGenerator, {})).not.toThrow();
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

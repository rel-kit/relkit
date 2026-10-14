/** Protects semantic export-map comparison while preserving exact public leaf and executable boundaries. */
import { expect, test } from "bun:test";
import { Schema } from "effect";
import { PackageExportManifest } from "../pack-export.schemas.js";
import { assertExportManifest } from "../pack-export-native.js";
import { expectedExports } from "../release-package-contract.js";

const decode = Schema.decodeUnknownSync(PackageExportManifest);

test("export-map property order does not change the public package contract", () => {
  const exports = Object.fromEntries(Object.entries(expectedExports("create-relkit")).reverse());
  expect(() =>
    assertExportManifest(
      "/fixture",
      "/fixture/packages/create-relkit",
      decode({
        name: "create-relkit",
        exports,
        bin: { "create-relkit": "./dist/bin.js" },
      }),
    ),
  ).not.toThrow();
});

test("a changed public leaf or executable remains an export contract failure", () => {
  const manifest = {
    name: "create-relkit",
    exports: expectedExports("create-relkit"),
    bin: { "create-relkit": "./dist/bin.js" },
  };
  expect(() =>
    assertExportManifest(
      "/fixture",
      "/fixture/packages/create-relkit",
      decode({
        ...manifest,
        exports: { ...manifest.exports, "./catalog-resolution": { import: "./dist/private.js" } },
      }),
    ),
  ).toThrow("Unsupported export map");
  expect(() =>
    assertExportManifest(
      "/fixture",
      "/fixture/packages/create-relkit",
      decode({
        ...manifest,
        bin: { "create-relkit": "./dist/private.js" },
      }),
    ),
  ).toThrow("Unexpected bin entry");
});

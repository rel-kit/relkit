import { expect, test } from "bun:test";
import {
  assertPackedDependencies,
  defaultCatalog,
  resolveCatalogVersion,
  resolveDependencyFields,
} from "../../scripts/catalog-manifest.ts";

const catalog = {
  catalog: { effect: "4.0.1", typescript: "5.9.3" },
  catalogs: { peer: { react: ">=18.0.0" } },
};

test("catalog resolution preserves concrete declarations and named peer ranges", () => {
  expect(
    resolveDependencyFields(
      {
        dependencies: { effect: "catalog:", "@relkit/app": "workspace:*" },
        devDependencies: { typescript: "catalog:" },
        peerDependencies: { react: "catalog:peer" },
      },
      catalog,
    ),
  ).toEqual({
    dependencies: { effect: "4.0.1", "@relkit/app": "workspace:*" },
    devDependencies: { typescript: "5.9.3" },
    optionalDependencies: {},
    peerDependencies: { react: ">=18.0.0" },
  });
});

test("missing or recursive catalogs fail without inventing a dependency version", () => {
  for (const [root, name, spec] of [
    [{}, "effect", "catalog:"],
    [catalog, "unknown", "catalog:"],
    [catalog, "react", "catalog:missing"],
    [{ catalog: { effect: "catalog:" } }, "effect", "catalog:"],
  ] as const)
    expect(() => resolveCatalogVersion(root, name, spec)).toThrow();
  expect(() => resolveCatalogVersion(catalog, "effect", undefined)).toThrow("Invalid dependency");
  expect(() => defaultCatalog({ catalog: { effect: "^4.0.1" } })).toThrow("not exact");
  for (const version of [
    "workspace:*",
    "link:effect",
    "file:../effect",
    "https://example.test/effect.tgz",
    "git+https://example.test/effect",
    "./effect",
  ])
    expect(() =>
      resolveCatalogVersion({ catalog: { effect: version } }, "effect", "catalog:"),
    ).toThrow("invalid catalog entry");
  expect(
    resolveCatalogVersion(
      { workspaces: { catalogs: { peer: { react: ">=18.0.0" } } } },
      "react",
      "catalog: peer ",
    ),
  ).toBe(">=18.0.0");
});

test("packed dependency validation requires concrete pins in every dependency field", () => {
  const source = {
    name: "fixture",
    dependencies: { effect: "catalog:", "@relkit/app": "workspace:*" },
    peerDependencies: { react: "catalog:peer" },
  };
  const packed = {
    ...source,
    dependencies: { effect: "4.0.1", "@relkit/app": "0.6.0" },
    peerDependencies: { react: ">=18.0.0" },
  };
  const names = new Set(["@relkit/app"]);
  expect(() => assertPackedDependencies(source, packed, catalog, names, "0.6.0")).not.toThrow();
  for (const dependencies of [
    { ...packed.dependencies, effect: "catalog:" },
    { ...packed.dependencies, effect: "4.0.0" },
    { ...packed.dependencies, "@relkit/app": "workspace:*" },
    { effect: "4.0.1" },
    { ...packed.dependencies, unrelated: "1.0.0" },
  ])
    expect(() =>
      assertPackedDependencies(source, { ...packed, dependencies }, catalog, names, "0.6.0"),
    ).toThrow();
  expect(() =>
    assertPackedDependencies(
      source,
      {
        ...packed,
        peerDependencies: { react: "catalog:peer" },
      },
      catalog,
      names,
      "0.6.0",
    ),
  ).toThrow();
});

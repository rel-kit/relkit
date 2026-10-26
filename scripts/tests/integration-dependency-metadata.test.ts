/**
 * Verifies the source-to-generated requirement ranges remain catalog-owned and
 * idempotent. Preserving export metadata and optional peer flags is necessary for
 * isolated packed consumers; no SDK or executable integration is evaluated.
 */
import { expect, it } from "vitest";
import { synchronizeIntegrationDependencies } from "../integration-dependency-metadata.js";

const dependency = {
  package: "sdk",
  supportedRange: "1.0.0",
  installSection: "dependencies",
  capabilities: ["cache"],
  phases: ["runtime"],
};
const manifest = {
  peerDependencies: { sdk: "catalog:" },
  peerDependenciesMeta: { sdk: { optional: true } },
  relkit: {
    integration: { id: "fixture", exports: { authoring: "." }, dependencies: [dependency] },
  },
};

it("regenerates exact prerelease ranges from their authoritative catalog", () => {
  const root = { catalog: { sdk: "2.0.0-beta.2" } };
  const metadata = synchronizeIntegrationDependencies(manifest, root);
  expect(metadata?.integration).toEqual({
    ...manifest.relkit.integration,
    dependencies: [{ ...dependency, supportedRange: "2.0.0-beta.2" }],
  });
  expect(synchronizeIntegrationDependencies({ ...manifest, relkit: metadata }, root)).toEqual(
    metadata,
  );
  expect(manifest.peerDependenciesMeta.sdk.optional).toBe(true);
});

it("rejects a requirement missing its owning declaration", () => {
  expect(() =>
    synchronizeIntegrationDependencies({ ...manifest, peerDependencies: {} }, {}),
  ).toThrow("no owning dependency");
});

it("rejects wildcard peer ranges during regeneration", () => {
  expect(() =>
    synchronizeIntegrationDependencies({ ...manifest, peerDependencies: { sdk: "*" } }, {}),
  ).toThrow();
});

it("preserves exact authoring lists through dependency synchronization", () => {
  const exports = { authoring: [".", "./sqlite", "./pg", "./mysql"] };
  const selected = {
    ...manifest,
    relkit: { integration: { ...manifest.relkit.integration, exports } },
  };
  const root = { catalog: { sdk: "2.0.0-beta.2" } };
  const metadata = synchronizeIntegrationDependencies(selected, root);
  expect(metadata?.integration).toEqual({
    ...selected.relkit.integration,
    dependencies: [{ ...dependency, supportedRange: "2.0.0-beta.2" }],
  });
  expect(synchronizeIntegrationDependencies({ ...selected, relkit: metadata }, root)).toEqual(
    metadata,
  );
});

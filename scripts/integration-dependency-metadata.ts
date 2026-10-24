/**
 * Regenerates integration requirement ranges from owning dependency declarations.
 * Package manifests remain the capability/phase source and the root catalogs own
 * shared pins; release synchronization cannot restore a stale duplicated range.
 */
import { Schema } from "effect";
import { IntegrationDependencyRequirements } from "@relkit/contracts";
import { resolveCatalogVersion } from "./catalog-manifest.js";
import type { CatalogManifest } from "./catalog-manifest.types.js";

const DependencyMap = Schema.Record(Schema.String, Schema.String);
const JsonRecord = Schema.Record(Schema.String, Schema.Json);
const Manifest = Schema.Struct({
  dependencies: Schema.optional(DependencyMap),
  peerDependencies: Schema.optional(DependencyMap),
  relkit: Schema.optional(JsonRecord),
});

/**
 * Resolves published ranges while preserving unrelated integration/build metadata.
 * @typeParam Input - Parsed JSON manifest decoded before any property access.
 * @param input - Source workspace package manifest.
 * @param root - Root catalog owning shared versions and supported peer ranges.
 * @returns RELKIT metadata with concrete requirement ranges, or no metadata.
 * @throws Schema errors or missing/unresolved owning dependency declarations.
 */
export function synchronizeIntegrationDependencies<Input>(input: Input, root: CatalogManifest) {
  const manifest = Schema.decodeUnknownSync(Manifest)(input);
  if (manifest.relkit === undefined) return undefined;
  const value = manifest.relkit.integration;
  if (value === undefined) return manifest.relkit;
  const integration = Schema.decodeUnknownSync(JsonRecord)(value);
  if (integration.dependencies === undefined) return manifest.relkit;
  const requirements = Schema.decodeUnknownSync(IntegrationDependencyRequirements)(
    integration.dependencies,
  );
  const dependencies = requirements.map((requirement) => {
    const declared =
      manifest.peerDependencies?.[requirement.package] ??
      manifest.dependencies?.[requirement.package];
    if (declared === undefined)
      throw new Error(`Integration requirement has no owning dependency: ${requirement.package}`);
    return {
      ...requirement,
      supportedRange: resolveCatalogVersion(root, requirement.package, declared),
    };
  });
  Schema.decodeUnknownSync(IntegrationDependencyRequirements)(dependencies);
  return { ...manifest.relkit, integration: { ...integration, dependencies } };
}

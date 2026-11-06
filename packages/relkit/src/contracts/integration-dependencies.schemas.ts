/**
 * Validates portable capability dependency declarations without loading SDKs.
 * Manifests and generated plans use this same schema; unresolved catalog values
 * and duplicate package declarations cannot cross the published wire boundary.
 */
import { Schema } from "effect";
import { validRange } from "semver";

const PackageName = Schema.String.check(Schema.isPattern(/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/));
// Wildcards belong to the version core; prerelease/build identifiers may contain x.
const WildcardCore = /(?:^|[\s|~^<>=])v?(?:\d+\.){0,2}[xX*](?=[.\s|+-]|$)/;
const VersionRange = Schema.String.check(
  Schema.makeFilter(
    (value) =>
      validRange(value) !== null && !WildcardCore.test(value) && /\d+\.\d+\.\d+/.test(value),
    {
      expected: "a concrete supported semantic version range without wildcards",
    },
  ),
);

/** Execution phases use consumer selection rather than package installation. */
export const IntegrationDependencyPhase = Schema.Literals(["check", "build", "runtime", "deploy"]);

/** One SDK/driver requirement shared by packaging, compiler and runtime. */
export const IntegrationDependencyRequirement = Schema.Struct({
  package: PackageName,
  supportedRange: VersionRange,
  installSection: Schema.Literals(["dependencies", "devDependencies"]),
  capabilities: Schema.Array(Schema.NonEmptyString).check(Schema.isNonEmpty(), Schema.isUnique()),
  phases: Schema.Array(IntegrationDependencyPhase).check(Schema.isNonEmpty(), Schema.isUnique()),
});

/** A package owns one declaration per SDK, with explicit capability/phase sets. */
export const IntegrationDependencyRequirements = Schema.Array(
  IntegrationDependencyRequirement,
).check(
  Schema.makeFilter(
    (entries) => new Set(entries.map((entry) => entry.package)).size === entries.length,
    {
      expected: "unique integration dependency package declarations",
    },
  ),
);

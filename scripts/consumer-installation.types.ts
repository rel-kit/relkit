/**
 * Defines collector results and traversal state. Canonical directories identify
 * installations; every encountered incoming edge retains a representative path.
 * Complete physical edges remain available when a shared package is visited once.
 */
import type { Schema } from "effect";
import type { ConsumerManifest as ManifestSchema } from "./consumer-installation.schemas.js";
import type { DependencyPath, InstalledDependency } from "./consumer-dependency-policy.types.js";

/** Validated native manifest metadata. */
export interface ConsumerManifest extends Schema.Schema.Type<typeof ManifestSchema> {}

/** Actual installation, edge inventory and required missing declarations. */
export interface ConsumerInstallation {
  readonly instances: readonly InstalledDependency[];
  readonly paths: readonly DependencyPath[];
  readonly edges: readonly {
    readonly from: string;
    readonly to: string;
    readonly name: string;
    /** Resolution relationship that does not itself require installation. */
    readonly optionalPeer?: boolean;
  }[];
  readonly missing: readonly { readonly packages: readonly string[]; readonly optional: boolean }[];
}

/** One pending traversal, with root-only development dependency inclusion. */
export interface InstallationVisit {
  readonly directory: string;
  readonly packages: readonly string[];
  readonly development: boolean;
}

/** Measured package bytes, excluding nested dependency directories. */
export interface PackageSize {
  readonly logicalBytes: number;
  readonly physicalBytes: number;
  readonly nativeFiles: readonly string[];
}

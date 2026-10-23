/**
 * Represents source ownership decisions and observed emitted declaration
 * references. The report distinguishes declared reachability from external
 * consumer proof, so source catalogs cannot masquerade as installed packages.
 */
import type { Schema } from "effect";
import type { OwnershipManifest as ManifestSchema } from "./consumer-ownership.schemas.js";

/** Validated package/starter/tooling manifest. */
export interface OwnershipManifest extends Schema.Schema.Type<typeof ManifestSchema> {}

/** Direct third-party edge with its intended responsibility and emitted references. */
export interface DependencyOwner {
  readonly consumer: string;
  readonly manifest: string;
  readonly dependency: string;
  readonly version: string;
  readonly field: string;
  readonly role: "development" | "runtime" | "optional-peer" | "peer" | "platform-or-optional";
  readonly capability: string;
  readonly finalOwner: string;
  readonly declarationReferences: readonly string[];
}

/** One source manifest, including exact entrypoint and producer declarations. */
export interface ManifestOwnership {
  readonly path: string;
  readonly category: "tooling" | "documentation" | "inspector" | "starter" | "consumer";
  readonly manifest: OwnershipManifest;
  readonly dependencies: readonly DependencyOwner[];
}

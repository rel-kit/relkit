/** Schema-derived native package metadata and the exact captured command contract for export smoke. */
import type { Effect, Schema } from "effect";
import type { ScaffoldProcess } from "./scaffold-process.js";
import type { PackageExportManifest as PackageSchema } from "./pack-export.schemas.js";

export type PackageExportManifest = Schema.Schema.Type<typeof PackageSchema>;
export type ExportCommand = Effect.Success<typeof ScaffoldProcess.make>["run"];
export interface ExportInventory {
  /** Every declared workspace package with its native manifest. */
  readonly manifests: Map<string, PackageExportManifest>;
  /** Native workspace directories, used only as read/build authorities. */
  readonly directories: readonly string[];
  /** Transitive first-party executable closure required by the public resolver fixture. */
  readonly requiredNames: Set<string>;
  /** Independently installed integrations whose unrelated peers must remain absent. */
  readonly integrationNames: Set<string>;
}

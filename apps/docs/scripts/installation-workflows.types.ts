/** Describes literal guide actions and the outside-workspace candidate context shared by sequential installation journeys. */
import type { Schema } from "effect";
import type { InstallationCatalog } from "./installation-catalog.types.js";
import type * as Schemas from "./installation-workflows.schemas.js";

export type GuideManifest = Schema.Schema.Type<typeof Schemas.GuideManifest>;

export type GuideRepair = Schema.Schema.Type<typeof Schemas.GuideRepair>;

/** Commands execute through the existing native process owner; repairs preserve the application manifest. */
export type GuideStep =
  | { readonly kind: "command"; readonly source: string }
  | { readonly kind: "repair"; readonly fields: GuideRepair };

/** Registry, caches and projects belong to one finite acceptance scope. */
export interface InstallationWorkflow {
  readonly repository: string;
  readonly temporary: string;
  readonly registry: string;
  readonly cache: string;
  readonly catalog: InstallationCatalog;
  readonly creator: string;
  readonly artifacts: string;
}
